import { rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// Stops Chrome and removes its profile directory. Chrome keeps writing to the profile while it
// shuts down, so wait for it to exit and retry the removal; a leftover temp directory is not
// worth failing a run over.
export async function stopChrome(chrome, userDataDir) {
  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
  }
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
    (err) => console.error(`warning: could not remove ${userDataDir}: ${err.code || err}`)
  );
}
