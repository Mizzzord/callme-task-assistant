export function validDiskPath(path: string) {
  return /^disk:\//.test(path) && path.length <= 1500 && !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) && !path.split("/").some((part) => part === "." || part === "..");
}
export function diskWebUrl(path: string, type: string): string | undefined {
  if (!validDiskPath(path)) return undefined;
  const parts = path.slice(6).split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..") || !["file", "dir"].includes(type)) return undefined;
  const folder = type === "dir" ? parts : parts.slice(0, -1);
  const url = new URL("https://disk.yandex.ru/client/disk" + (folder.length ? "/" + folder.map(encodeURIComponent).join("/") : ""));
  if (type === "file") {
    url.searchParams.set("idApp", "client");
    url.searchParams.set("dialog", "slider");
    url.searchParams.set("idDialog", "/disk/" + parts.join("/"));
  }
  return url.toString();
}
