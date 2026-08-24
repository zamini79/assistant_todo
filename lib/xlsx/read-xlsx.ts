/**
 * 최소 XLSX 리더 — 명부 한 종류를 읽기 위한 것.
 *
 * 라이브러리를 쓰지 않는 이유: 후보들이 20MB가 넘고 취약한 전이 의존성을 달고 온다.
 * 여기서 필요한 건 "시트 하나를 문자열 표로 읽기"뿐이라 직접 푼다.
 *
 * xlsx는 ZIP 안에 XML이 든 형식이다. 중앙 디렉터리에서 항목을 찾아
 * deflate를 풀고, sharedStrings와 시트 XML을 훑는다.
 * (중앙 디렉터리를 쓰므로 크기가 데이터 서술자에 들어 있는 파일도 문제없다.)
 *
 * 지원하지 않는 것: 암호화, ZIP64(4GB 초과), 수식 결과 없는 셀.
 * 명부 파일에는 해당 사항이 없고, 못 읽으면 예외로 알린다.
 */
import { inflateRawSync } from "node:zlib";

export class XlsxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "XlsxError";
  }
}

const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/** ZIP 중앙 디렉터리를 읽어 항목별 압축 데이터를 꺼낸다 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  // 끝에서 EOCD(End Of Central Directory)를 거꾸로 찾는다. 주석이 붙어 있을 수 있다.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === SIG_END) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("엑셀 파일 형식이 아닙니다.");

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new XlsxError("엑셀 파일이 손상됐습니다.");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // 로컬 헤더는 이름·extra 길이가 중앙 디렉터리와 다를 수 있어 다시 읽는다.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    try {
      files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    } catch (error) {
      throw new XlsxError(`엑셀 파일을 풀지 못했습니다: ${name}`, { cause: error });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? whole;
  });
}

/** `<t>` 조각을 모두 이어 붙인다 — 서식이 나뉘면 여러 조각으로 쪼개진다 */
function joinTextNodes(xml: string): string {
  const parts: string[] = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) parts.push(decodeXml(m[1] ?? ""));
  return parts.join("");
}

function readSharedStrings(files: Map<string, Buffer>): string[] {
  const raw = files.get("xl/sharedStrings.xml");
  if (!raw) return [];

  const xml = raw.toString("utf8");
  const out: string[] = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(joinTextNodes(m[1] ?? ""));
  return out;
}

/** 셀 참조(`B12`)에서 열 번호(0부터) */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 시트를 문자열 2차원 배열로. 빈 칸은 "" 로 채운다. */
function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const body = rowMatch[1] ?? "";
    const cells: string[] = [];

    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(body)) !== null) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";

      let value = "";
      if (type === "s") {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = shared[index] ?? "";
      } else if (type === "inlineStr") {
        value = joinTextNodes(inner);
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }

      // 빈 칸이 통째로 생략될 수 있으므로 참조 기준으로 자리를 맞춘다.
      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** 첫 번째 시트를 문자열 표로 읽는다 */
export function readFirstSheet(buffer: Buffer): string[][] {
  const files = unzip(buffer);

  // 워크북이 참조하는 첫 시트를 찾되, 못 찾으면 흔한 경로로 떨어진다.
  const sheetPath =
    [...files.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort()[0] ?? "xl/worksheets/sheet1.xml";

  const sheet = files.get(sheetPath);
  if (!sheet) throw new XlsxError("엑셀에 시트가 없습니다.");

  return readSheet(sheet.toString("utf8"), readSharedStrings(files));
}
