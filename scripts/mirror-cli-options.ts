export function parseMirrorArgs(args: string[]) {
  if (
    args.length !== 1 ||
    !["--help", "--dry-run", "--apply", "--setup"].includes(args[0])
  )
    throw new Error(
      "Choose exactly one of --help, --dry-run, --apply, --setup.",
    );
  return args[0];
}
