/**
 * S3 어댑터 (사내 AWS).
 *
 * ⚠️ Storage SDK를 쓰는 유일한 파일 중 하나다(다른 하나는 supabase-storage.ts).
 * 앱 코드는 FileStorage 인터페이스만 안다.
 *
 * 버킷은 비공개다. 다운로드는 서버가 내용을 읽어 직접 내려준다 — 서명 URL로
 * 리다이렉트하지 않으므로 버킷 주소가 브라우저에 노출되지 않는다.
 *
 * 자격증명은 코드로 받지 않는다. ECS 태스크 역할(IRSA/Task Role)을 SDK가
 * 자동으로 집어 쓰게 둔다 — 키를 환경변수로 들고 다니면 컨테이너 덤프나
 * 로그에 섞여 나갈 수 있다. 로컬 개발에서만 AWS_* 환경변수가 대신 쓰인다.
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { StorageError, type FileStorage } from "./storage";

export type S3Config = {
  bucket: string;
  region: string;
  /** 사내 S3 호환 스토리지를 쓸 때만 지정한다 (MinIO 등) */
  endpoint?: string;
  /** 커스텀 엔드포인트는 대개 path-style을 요구한다 */
  forcePathStyle?: boolean;
};

export function createS3Storage(config: S3Config): FileStorage {
  const options: S3ClientConfig = { region: config.region };
  if (config.endpoint) {
    options.endpoint = config.endpoint;
    options.forcePathStyle = config.forcePathStyle ?? true;
  }
  const client = new S3Client(options);

  return {
    async put({ key, body, contentType }) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: new Uint8Array(body),
            ContentType: contentType ?? "application/octet-stream",
            /*
             * S3에는 "있으면 실패"가 기본으로 없다. 조건부 쓰기로 덮어쓰기를 막는다 —
             * 키가 겹치면 남의 파일을 조용히 지우는 대신 실패해야 한다.
             * 키에 UUID가 들어가 실제로 겹칠 일은 거의 없지만, 겹쳤을 때
             * 조용히 지나가는 쪽이 훨씬 나쁘다.
             */
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        throw new StorageError("파일을 저장하지 못했습니다.", { cause: error });
      }
    },

    async get(key) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!out.Body) throw new Error("빈 응답");
        // 첨부 상한이 10MB라 통째로 올려 읽어도 부담이 크지 않다.
        const bytes = await out.Body.transformToByteArray();
        return {
          // 버퍼 풀을 공유하지 않도록 잘라 낸 복사본을 준다.
          body: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
          contentType: out.ContentType ?? null,
        };
      } catch (error) {
        throw new StorageError("파일을 읽지 못했습니다.", { cause: error });
      }
    },

    async remove(keys) {
      if (keys.length === 0) return;
      try {
        // DeleteObjects는 한 번에 1000개까지다.
        const CHUNK = 1000;
        for (let i = 0; i < keys.length; i += CHUNK) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: {
                Objects: keys.slice(i, i + CHUNK).map((Key) => ({ Key })),
                // 지운 목록을 돌려받지 않는다. 결과를 쓰지 않는다.
                Quiet: true,
              },
            }),
          );
        }
      } catch (error) {
        /*
         * 이미 없는 키는 S3가 성공으로 처리한다 — 별도 분기가 필요 없다.
         * 이 경로는 이력·지시사항 삭제에 딸려 도는 정리 작업이라,
         * 스토리지가 어긋났다고 삭제 자체를 막으면 사용자가 지울 수 없는
         * 데이터가 생긴다. 호출자(cleanUpStorage)가 로그만 남기고 넘어간다.
         */
        throw new StorageError("파일을 삭제하지 못했습니다.", { cause: error });
      }
    },
  };
}
