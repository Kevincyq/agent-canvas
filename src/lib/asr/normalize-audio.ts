import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type NormalizedAudio = {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });
}

function shouldConvertToWav(fileName: string, mimeType: string): boolean {
  const lowerName = fileName.toLowerCase();

  return (
    mimeType.includes("webm") ||
    mimeType.includes("ogg") ||
    lowerName.endsWith(".webm") ||
    lowerName.endsWith(".ogg")
  );
}

export async function normalizeAudioForAsr(
  bytes: ArrayBuffer,
  fileName: string,
  mimeType: string,
): Promise<NormalizedAudio> {
  if (!shouldConvertToWav(fileName, mimeType)) {
    return { bytes, fileName, mimeType };
  }

  const id = randomUUID();
  const inputPath = join(tmpdir(), `asr-in-${id}.webm`);
  const outputPath = join(tmpdir(), `asr-out-${id}.wav`);

  try {
    await writeFile(inputPath, Buffer.from(bytes));
    await runFfmpeg(["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-f", "wav", outputPath]);
    const wavBytes = await readFile(outputPath);

    return {
      bytes: wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength),
      fileName: fileName.replace(/\.(webm|ogg)$/i, ".wav"),
      mimeType: "audio/wav",
    };
  } catch {
    return { bytes, fileName, mimeType };
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}
