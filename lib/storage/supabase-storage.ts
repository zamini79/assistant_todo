/**
 * Supabase Storage 어댑터.
 *
 * ⚠️ Storage SDK를 쓰는 유일한 파일이다. S3 이관 시 이 파일과 짝이 되는
 * s3-storage.ts를 만들고 index.ts의 분기만 바꾼다.
 *
 * 버킷은 비공개다. 다운로드는 서버가 내용을 읽어 직접 내려준다 —
 * 스토리지 URL이 브라우저에 노출되지 않는다.
 *
 * 리포지토리 어댑터와 같이 `server-only`를 붙이지 않는다. 서버 전용 경계는
 * 팩토리(index.ts)가 세우고, 어댑터는 이관 스크립트에서 직접 쓸 수 있어야 한다.
 */
import { createClient } from "@supabase/supabase-js";

import { StorageError, type FileStorage } from "./storage";

export const BUCKET = "todo-attachments";

export function createSupabaseStorage(url: string, key: string): FileStorage {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = () => client.storage.from(BUCKET);

  return {
    async put({ key: objectKey, body, contentType }) {
      const { error } = await bucket().upload(objectKey, body, {
        contentType: contentType ?? "application/octet-stream",
        // 덮어쓰지 않는다 — 키가 겹치면 남의 파일을 조용히 지우는 대신 실패해야 한다.
        upsert: false,
      });
      if (error) {
        throw new StorageError("파일을 저장하지 못했습니다.", { cause: error });
      }
    },

    async get(objectKey) {
      const { data, error } = await bucket().download(objectKey);
      if (error || !data) {
        throw new StorageError("파일을 읽지 못했습니다.", { cause: error });
      }
      return {
        body: await data.arrayBuffer(),
        contentType: data.type || null,
      };
    },

    async remove(keys) {
      if (keys.length === 0) return;
      const { error } = await bucket().remove(keys);
      /*
       * 이미 없는 키는 실패로 보지 않는다.
       * 이 경로는 이력·지시사항 삭제에 딸려 도는 정리 작업이라,
       * 스토리지가 어긋났다고 삭제 자체를 막으면 사용자가 지울 수 없는 데이터가 생긴다.
       */
      if (error) {
        throw new StorageError("파일을 삭제하지 못했습니다.", { cause: error });
      }
    },
  };
}
