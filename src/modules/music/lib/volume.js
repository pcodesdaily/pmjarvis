import config from "../../../config.js";

/**
 * Lavalink is driven a little below the volume we show the user
 * (`VOLUME_DECREMENTER`) so boosted EQ presets have headroom. lavalink-client
 * then recomputes `player.volume` by dividing that scaled number back out, which
 * rounds and drifts — pressing 🔉 from 100% would land on 91%, not 90%.
 *
 * So the number the user asked for is remembered separately and is the only one
 * ever displayed or stepped from.
 */
export const displayVolume = (player) => player.getData("displayVolume") ?? player.volume;

export async function setDisplayVolume(player, percent) {
  const clamped = Math.round(Math.min(Math.max(percent, 0), config.music.maxVolume));
  await player.setVolume(clamped);
  player.setData("displayVolume", clamped);
  return clamped;
}
