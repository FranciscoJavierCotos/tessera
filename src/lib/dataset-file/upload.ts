/**
 * PUTs `file` to a Storage signed upload URL, reporting progress (fetch cannot
 * report upload progress, so this uses XHR).
 */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`The upload failed (${xhr.status}). Try again.`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error("The upload failed. Check your connection and try again."),
      );
    xhr.send(file);
  });
}
