export const Directory = {
  Cache: "CACHE",
  Documents: "DOCUMENTS",
  Data: "DATA",
  External: "EXTERNAL",
  ExternalStorage: "EXTERNAL_STORAGE",
} as const;

export const Encoding = {
  UTF8: "utf8",
  ASCII: "ascii",
  UTF16: "utf16",
} as const;

export const Filesystem = {
  writeFile: async ({
    path,
  }: {
    path: string;
    data: string;
    directory?: string;
    encoding?: string;
  }): Promise<{ uri: string }> => ({ uri: `file://${path}` }),

  readFile: async (_opts: {
    path: string;
    directory?: string;
    encoding?: string;
  }): Promise<{ data: string }> => ({ data: "" }),
};
