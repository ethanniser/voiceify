"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const ADAM_VOICE_ID = "s3TPKV1kjDlVtZbl4Ksh";

export const generateAudio = internalAction({
  args: { text: v.string() },
  handler: async (ctx, args): Promise<ArrayBuffer> => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const elevenlabs = new ElevenLabsClient({
      apiKey: apiKey,
    });

    const audioStream = await elevenlabs.textToSpeech.convert(ADAM_VOICE_ID, {
      text: args.text,
      modelId: "eleven_multilingual_v2",
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.5,
      },
    });

    // Convert stream to ArrayBuffer
    const reader = audioStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine all chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  },
});
