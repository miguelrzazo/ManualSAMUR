import { markAttachmentUnavailable, type ManualAttachment, type AttachmentDownloadFailure } from "./manual-sync.ts";

function filename(source: string): string {
  return decodeURIComponent(source.split("/").at(-1)?.split("?")[0] ?? "").split("@").at(-1) ?? "";
}

/** Keep a previously validated local copy when the official server loses an asset. */
export function recoverAttachmentDownload(
  incoming: ManualAttachment,
  previous: ManualAttachment[],
  failure: AttachmentDownloadFailure,
  localExists: (localPath: string) => boolean,
): ManualAttachment {
  if (localExists(incoming.localPath)) return incoming;
  const cached = previous.find((attachment) =>
    (attachment.sourceUrl === incoming.sourceUrl || filename(attachment.sourceUrl) === filename(incoming.sourceUrl))
    && attachment.kind === incoming.kind && localExists(attachment.localPath),
  );
  if (cached) return { ...incoming, localPath: cached.localPath };
  return markAttachmentUnavailable(incoming, failure);
}
