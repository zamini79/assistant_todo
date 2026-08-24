/**
 * 최소 XLSX 리더.
 *
 * 실제 명부 파일에 의존하지 않도록 테스트 안에서 xlsx를 만들어 읽는다
 * (그 파일은 사원 개인정보라 저장소에 둘 수 없다).
 * 저장(무압축)·deflate 두 경로를 모두 확인한다.
 */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { readFirstSheet, XlsxError } from "@/lib/xlsx/read-xlsx";

const crc32Table = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = crc32Table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 최소 ZIP 작성기 — 테스트 픽스처용 */
function zip(entries: { name: string; data: Buffer }[], compress: boolean): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const stored = compress ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(compress ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + stored.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

/** 공유 문자열을 쓰는 일반적인 형태의 xlsx */
function makeXlsx(rows: string[][], compress = true): Buffer {
  const shared: string[] = [];
  const indexOf = (v: string) => {
    const at = shared.indexOf(v);
    if (at >= 0) return at;
    shared.push(v);
    return shared.length - 1;
  };

  const body = rows
    .map((cells, r) => {
      const cs = cells
        .map((v, c) => {
          if (v === "") return "";
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          return `<c r="${ref}" t="s"><v>${indexOf(v)}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join("");

  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
  const strings = `<?xml version="1.0"?><sst count="${shared.length}">${shared
    .map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)
    .join("")}</sst>`;

  return zip(
    [
      { name: "xl/sharedStrings.xml", data: Buffer.from(strings, "utf8") },
      { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet, "utf8") },
    ],
    compress,
  );
}

describe("readFirstSheet", () => {
  const ROWS = [
    ["이름", "email", "부서", "직책"],
    ["김철수", "test1@example.com", "가상2팀", "Manager"],
    ["홍길동", "hong@example.com", "가상1팀", "Manager"],
  ];

  it("압축된 xlsx를 읽는다", () => {
    expect(readFirstSheet(makeXlsx(ROWS))).toEqual(ROWS);
  });

  it("무압축(stored) xlsx도 읽는다", () => {
    expect(readFirstSheet(makeXlsx(ROWS, false))).toEqual(ROWS);
  });

  it("한글과 특수문자가 깨지지 않는다", () => {
    const rows = [["이름"], ["김&이 <팀>"]];
    expect(readFirstSheet(makeXlsx(rows))).toEqual(rows);
  });

  it("중간 빈 칸의 자리를 지킨다", () => {
    // 빈 셀은 XML에서 통째로 생략된다. 참조(r=)로 자리를 맞추지 않으면 열이 밀린다.
    const rows = [["A", "", "C"]];
    expect(readFirstSheet(makeXlsx(rows))).toEqual([["A", "", "C"]]);
  });

  it("엑셀이 아니면 명확히 실패한다", () => {
    expect(() => readFirstSheet(Buffer.from("hello world"))).toThrow(XlsxError);
  });
});
