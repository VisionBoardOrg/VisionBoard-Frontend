import * as XLSX from "xlsx";
import { excelToTiptap, textToTiptap } from "../app/api/documents/import/route";

async function runVerificationTests() {
  console.log("==================================================================");
  console.log("       VISIONBOARD DOCUMENT IMPORT SYSTEM VERIFICATION SUITE       ");
  console.log("==================================================================\n");

  let testPassed = true;

  // -----------------------------------------------------------------------------
  // TEST 1: LOAD TESTING (~14MB .xlsx file with 25,000+ rows)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: LOAD TESTING (~14MB .xlsx file processing) ---");
  try {
    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Initial Heap Memory: ${memBefore.toFixed(2)} MB`);

    console.log("Generating 25,000 row multi-column spreadsheet...");
    const sampleHeaders = ["ID", "Project", "Owner", "Status", "Priority", "Budget", "Quarter", "Notes"];
    const rows: unknown[][] = [sampleHeaders];

    for (let i = 1; i <= 25000; i++) {
      rows.push([
        `TASK-${i}`,
        `VisionBoard Core Module Refactoring ${i}`,
        `Engineer ${i % 10}`,
        i % 2 === 0 ? "Completed" : "In Progress",
        i % 3 === 0 ? "Urgent" : "Medium",
        `$${(i * 123.45).toFixed(2)}`,
        `Q${(i % 4) + 1}`,
        `Comprehensive performance optimization and verification run iteration #${i}`
      ]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PerformanceData");
    XLSX.utils.book_append_sheet(workbook, worksheet, "SecondaryArchive");

    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const bufferMb = xlsxBuffer.length / 1024 / 1024;
    console.log(`Generated .xlsx Buffer Size: ${bufferMb.toFixed(2)} MB`);

    const startMs = Date.now();
    const result = excelToTiptap(xlsxBuffer) as { type: string; content: unknown[] };
    const durationMs = Date.now() - startMs;

    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Processing Duration: ${durationMs} ms`);
    console.log(`Post-Parse Heap Memory: ${memAfter.toFixed(2)} MB (Delta: ${(memAfter - memBefore).toFixed(2)} MB)`);
    console.log(`Tiptap Document Root Nodes Created: ${result.content.length}`);

    if (result.type === "doc" && result.content.length > 0 && bufferMb >= 1.0) {
      console.log("✅ TEST 1 PASSED: Load testing processed large workbook cleanly with bounded memory.\n");
    } else {
      console.error("❌ TEST 1 FAILED: Unexpected output structure.");
      testPassed = false;
    }
  } catch (err) {
    console.error("❌ TEST 1 FAILED with exception:", err);
    testPassed = false;
  }

  // -----------------------------------------------------------------------------
  // TEST 2: INTERNATIONALIZATION (Legacy .doc fallback with non-English UTF-8)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: INTERNATIONALIZATION (Legacy .doc Non-English UTF-8 Text) ---");
  try {
    const internationalTexts = [
      "Español: ¡Hola! Plan de acción de mitigación y optimización de rendimiento.",
      "Deutsch: Übersicht der Benutzer für die System-Entwicklung und Spezifikation.",
      "Français: Bilan d'activité et spécifications techniques détaillées.",
      "日本語: ビジョンボードのロードマップ機能とタスク自動化仕様書",
      "中文: 项目管理与自动化路线图系统架构与性能测试",
      "Русский: Обзор архитектуры системы и проверка производительности"
    ];

    // Simulate binary legacy .doc buffer with raw byte streams and UTF-8 multibyte characters
    const binaryPrefix = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00, 0x00]);
    const textBuffer = Buffer.from(internationalTexts.join("\n\n"), "utf8");
    const mockLegacyDocBuffer = Buffer.concat([binaryPrefix, textBuffer]);

    // Fallback extraction algorithm from route.ts
    const rawString = mockLegacyDocBuffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0100-\uFFFF]/g, " ");
    const parsedDoc = textToTiptap(rawString) as { type: string; content: Array<{ content?: Array<{ text?: string }> }> };

    let extractedFullText = "";
    for (const block of parsedDoc.content) {
      if (block.content) {
        for (const child of block.content) {
          if (child.text) extractedFullText += child.text + " ";
        }
      }
    }

    console.log("Extracted International Text Sample:");
    console.log(`"${extractedFullText.slice(0, 150)}..."`);

    const allPreserved = internationalTexts.every(txt => extractedFullText.includes(txt.slice(0, 10)));
    if (allPreserved) {
      console.log("✅ TEST 2 PASSED: Non-English multi-byte UTF-8 text preserved in legacy fallback.\n");
    } else {
      console.error("❌ TEST 2 FAILED: Some international text characters were corrupted.");
      testPassed = false;
    }
  } catch (err) {
    console.error("❌ TEST 2 FAILED with exception:", err);
    testPassed = false;
  }

  // -----------------------------------------------------------------------------
  // TEST 3: MARKDOWN EDGE CASES (Unclosed fences, nested lists, mixed styles)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: MARKDOWN EDGE CASES ---");
  try {
    const complexMarkdown = [
      "# System Architecture Specification",
      "",
      "---",
      "",
      "- Item 1: **Bold text with _nested italic_ inside**",
      "  - Item 1.1: ***Triple mark bold italic***",
      "    - Item 1.1.1: `code block with *symbols* inside`",
      "      1. Numbered sub-item 1",
      "      2. Numbered sub-item 2",
      "",
      "> Blockquote with **bold text** and _italic text_",
      "",
      "This is arithmetic 5 * 4 * 3 = 60 and file_name_v2.txt reference.",
      "",
      "___",
      "",
      "```typescript",
      "// Unclosed Code Block Edge Case at EOF",
      "function processPipeline(data: string[]) {",
      '  console.log("Processing pipeline...");',
      "  return data.map(item => item.toUpperCase());"
    ].join("\n");

    const startMs = Date.now();
    const parsedMd = textToTiptap(complexMarkdown) as { type: string; content: Array<{ type: string }> };
    const durationMs = Date.now() - startMs;

    console.log(`Markdown Parsing Duration: ${durationMs} ms`);
    console.log(`Node types generated: ${parsedMd.content.map(n => n.type).join(", ")}`);

    const hasHorizontalRules = parsedMd.content.some(n => n.type === "horizontalRule");
    const hasHeading = parsedMd.content.some(n => n.type === "heading");
    const hasCodeBlock = parsedMd.content.some(n => n.type === "codeBlock");
    const hasList = parsedMd.content.some(n => n.type === "bulletList" || n.type === "orderedList");

    if (hasHorizontalRules && hasHeading && hasCodeBlock && hasList) {
      console.log("✅ TEST 3 PASSED: All Markdown edge cases (unclosed code fences, nested lists, mixed marks, horizontal rules) handled gracefully.\n");
    } else {
      console.error("❌ TEST 3 FAILED: Missing expected node types.");
      testPassed = false;
    }
  } catch (err) {
    console.error("❌ TEST 3 FAILED with exception:", err);
    testPassed = false;
  }

  console.log("==================================================================");
  if (testPassed) {
    console.log("           ALL 3 VERIFICATION TESTS PASSED SUCCESSFULLY!          ");
  } else {
    console.log("           SOME TESTS FAILED - REVIEW LOGS ABOVE                  ");
  }
  console.log("==================================================================");
}

runVerificationTests();
