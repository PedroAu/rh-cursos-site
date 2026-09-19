import { describe, expect, it } from "vitest";

import { imapInternals } from "../src/imap-source.js";

describe("IMAP header parsing", () => {
  it("desdobra References e preserva somente identificadores de mensagem", () => {
    const headers = imapInternals.parseHeaderBlock(Buffer.from([
      "Message-ID: <reply@example.test>",
      "In-Reply-To: <outbound@example.test>",
      "References: <first@example.test>",
      " <outbound@example.test>",
      "",
    ].join("\r\n")));

    expect(headers.get("references")).toBe("<first@example.test> <outbound@example.test>");
    expect(imapInternals.messageIds(headers.get("references"))).toEqual([
      "<first@example.test>",
      "<outbound@example.test>",
    ]);
  });
});
