import { join } from "node:path"
import { getOpenCodeStorageDir } from "../../shared/data-path"

export const COST_METERING_STORAGE = join(getOpenCodeStorageDir(), "cost-metering")
export const HOOK_NAME = "cost-metering"
