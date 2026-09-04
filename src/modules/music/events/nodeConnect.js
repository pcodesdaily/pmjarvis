import { createLogger } from "../../../core/logger.js";

const log = createLogger("node");

export default {
  name: "connect",
  emitter: "nodes",

  execute(client, node) {
    log.info(`Audio node "${node.id}" connected (Lavalink ${node.info?.version?.semver ?? "unknown"}).`);
  },
};
