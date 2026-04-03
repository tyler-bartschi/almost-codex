import * as fs from "fs";
import * as path from "path";
import { getGlobalReplRootDir } from "../../global/ReplStateStore";

/**
 * Formats a date as a local ISO-like timestamp without a timezone offset.
 * @param {Date} date Date instance to format.
 * @returns {string} A local timestamp in `YYYY-MM-DDTHH:mm:ss.sss` format.
 */
function formatLocalIsoTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Creates a markdown planning file under the REPL root `agent-plans` directory.
 * @param {string} name Base name to use for the planning file.
 * @param {string} content Markdown content to write into the planning file.
 * @returns {string} The generated planning file name once it has been written.
 */
export function savePlan(name: string, content: string): string {
  const rootDir = getGlobalReplRootDir();
  const plansDirectoryPath = path.join(rootDir, "agent-plans");
  const timestamp = formatLocalIsoTimestamp(new Date());
  const planningFileName = `${name}-${timestamp}.md`;
  const planningFilePath = path.join(plansDirectoryPath, planningFileName);

  try {
    fs.mkdirSync(plansDirectoryPath, { recursive: true });
    fs.writeFileSync(planningFilePath, content, { encoding: "utf-8", flag: "wx" });
    return planningFileName;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("File name already taken. Please try again with a different file name");
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to save plan file "${planningFileName}": ${errorMessage}`,
    );
  }
}

/**
 * Reads a markdown planning file from the REPL root `agent-plans` directory.
 * @param {string} filename Planning file name to read.
 * @returns {string} The contents of the planning file.
 */
export function readPlan(filename: string): string {
  const rootDir = getGlobalReplRootDir();
  const plansDirectoryPath = path.join(rootDir, "agent-plans");
  const planningFilePath = path.join(plansDirectoryPath, filename);

  if (!fs.existsSync(plansDirectoryPath) || !fs.existsSync(planningFilePath)) {
    throw new Error("The plan does not exist");
  }

  return fs.readFileSync(planningFilePath, "utf-8");
}
