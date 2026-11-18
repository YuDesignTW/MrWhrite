// OS-enforced command filesystem policy. Never combine with legacy --sandbox.
export function codexPolicy(cwd) {
  const settings = {
    default_permissions: "mr-white-node",
    "permissions.mr-white-node.filesystem": {
      ":root": "deny",
      ":minimal": "read",
      ":tmpdir": "deny",
      ":slash_tmp": "deny",
      [cwd]: "read",
    },
    "permissions.mr-white-node.network.enabled": false,
  };
  const toml = (value) =>
    typeof value === "object"
      ? `{${Object.entries(value)
          .map(([k, v]) => `${JSON.stringify(k)}=${toml(v)}`)
          .join(",")}}`
      : JSON.stringify(value);
  return Object.entries(settings).flatMap(([key, value]) => [
    "-c",
    `${key}=${toml(value)}`,
  ]);
}
