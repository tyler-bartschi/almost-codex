import OpenAI from "openai";
import * as fs from "fs";
import * as yaml from "yaml";
import promptSync from "prompt-sync";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is not set.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const prompt = promptSync();

async function main() {
  try {
    const rawContent = fs.readFileSync(
      "src/personalities/efficient.yaml",
      "utf-8",
    );

    // replace with the actual configuration type
    const config = yaml.parse(rawContent) as any;

    const systemPrompt = config.prompt;

    const history: any[] = [{ role: "system", content: systemPrompt }];

    let message: string = prompt("Enter a message: ");

    while (true) {
      history.push({ role: "user", content: message });

      const response = await client.responses.create({
        model: "gpt-5-nano",
        input: history,
      });
      console.log(response.output_text);
      
      message = prompt("");
      if (message === "") {
        return;
      }
    }
  } catch (error) {
    console.error(`Error calling OpenAI API:`, error);
  }
}

main();
