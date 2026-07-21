#!/usr/bin/env python3
"""
Splits a source rulebook PDF into fixed-size page chunks under Gemini's 50MB
per-file limit, so large books (like an 85MB PHB) can be uploaded at all.
Output goes to sources/_split/<book>/chunk-NN.pdf (gitignored).

Usage: python3 scripts/extract/split_pdf.py <input.pdf> <book-id> <pages-per-chunk>
"""
import sys
import os
import fitz  # pymupdf

def main():
    if len(sys.argv) != 4:
        print("Usage: split_pdf.py <input.pdf> <book-id> <pages-per-chunk>")
        sys.exit(1)

    input_path, book_id, pages_per_chunk = sys.argv[1], sys.argv[2], int(sys.argv[3])
    out_dir = os.path.join(os.path.dirname(__file__), "..", "..", "sources", "_split", book_id)
    os.makedirs(out_dir, exist_ok=True)

    doc = fitz.open(input_path)
    total_pages = doc.page_count
    chunk_index = 0
    manifest = []

    for start in range(0, total_pages, pages_per_chunk):
        end = min(start + pages_per_chunk, total_pages)
        chunk_index += 1
        chunk = fitz.open()
        chunk.insert_pdf(doc, from_page=start, to_page=end - 1)
        out_path = os.path.join(out_dir, f"chunk-{chunk_index:02d}.pdf")
        chunk.save(out_path)
        chunk.close()
        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        # PDF page numbers are 0-indexed internally; report 1-indexed for humans.
        manifest.append({"chunk": chunk_index, "firstPage": start + 1, "lastPage": end, "sizeMb": round(size_mb, 1)})
        print(f"chunk-{chunk_index:02d}.pdf: pages {start + 1}-{end} ({size_mb:.1f} MB)")

    doc.close()
    print(f"\nSplit {total_pages} pages into {chunk_index} chunks in {out_dir}")

if __name__ == "__main__":
    main()
