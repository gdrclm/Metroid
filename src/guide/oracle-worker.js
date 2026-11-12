import { forecast } from "./oracle.js";
let world, config;
self.onmessage = ({ data }) => {
  if (data.type === "init") {
    world = data.world;
    config = data.config;
    return;
  }
  try {
    self.postMessage({
      id: data.id,
      stamp: data.stamp,
      result: forecast(world, config, data.snapshot),
    });
  } catch (error) {
    self.postMessage({ id: data.id, stamp: data.stamp, error: error.message });
  }
};
