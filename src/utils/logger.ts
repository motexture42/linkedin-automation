export function outputJson(data: any) {
  console.log(JSON.stringify(data, null, 2));
}

export function outputError(reason: string, code: number = 3, extraInfo: any = {}) {
  const errorObj = {
    error: true,
    reason,
    ...extraInfo
  };
  console.error(JSON.stringify(errorObj, null, 2));
  process.exit(code);
}
