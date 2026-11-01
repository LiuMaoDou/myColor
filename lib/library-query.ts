/** Keep retired filters out of navigation and resource-list requests. */
export function libraryQuery(input: { toString(): string }) {
  const params = new URLSearchParams(input.toString());
  for (const key of [...params.keys()]) {
    if (!["type", "q", "sort", "page"].includes(key)) params.delete(key);
  }
  if (params.get("sort") === "manual") params.delete("sort");
  return params;
}
