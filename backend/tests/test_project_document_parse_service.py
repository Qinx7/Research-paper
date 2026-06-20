import unittest
from unittest.mock import patch


class ProjectDocumentParseServiceTests(unittest.TestCase):
    def test_plain_text_is_cleaned_and_chunked_with_overlap(self):
        from app.services.document_parse_service import clean_extracted_text, chunk_text

        text = "第一段内容。\n\n\n第二段内容包含研究方法和实验数据。\n第三段内容。"
        cleaned = clean_extracted_text(text)
        chunks = chunk_text(cleaned, chunk_size=18, overlap=6)

        self.assertNotIn("\n\n\n", cleaned)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertEqual(chunks[0].index, 0)
        self.assertIn("研究方法", "".join(chunk.content for chunk in chunks))
        self.assertTrue(all(chunk.content.strip() for chunk in chunks))

    def test_unsupported_extension_raises_clear_error(self):
        from app.services.document_parse_service import UnsupportedDocumentType, extract_text_from_bytes

        with self.assertRaises(UnsupportedDocumentType) as ctx:
            extract_text_from_bytes(b"demo", "image.png")

        self.assertIn("不支持解析", str(ctx.exception))

    def test_text_pdf_can_be_extracted_when_pypdf_is_installed(self):
        from fpdf import FPDF

        from app.services.document_parse_service import extract_text_from_bytes

        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", size=12)
        pdf.cell(40, 10, text="AI writing support evidence")
        data = bytes(pdf.output())

        parsed = extract_text_from_bytes(data, "evidence.pdf")

        self.assertEqual(parsed.source_type, ".pdf")
        self.assertIn("AI writing support evidence", parsed.text)

    def test_scanned_pdf_falls_back_to_ocr_when_pypdf_extracts_no_text(self):
        from fpdf import FPDF

        from app.services.document_parse_service import extract_text_from_bytes

        pdf = FPDF()
        pdf.add_page()
        data = bytes(pdf.output())

        with patch(
            "app.services.document_parse_service._ocr_pdf_text",
            return_value="OCR recognized scanned content",
            create=True,
        ) as ocr:
            parsed = extract_text_from_bytes(data, "scan.pdf")

        self.assertEqual(parsed.source_type, ".pdf")
        self.assertEqual(parsed.meta["parser"], "pypdf+ocr")
        self.assertIn("OCR recognized scanned content", parsed.text)
        ocr.assert_called_once()

    def test_scanned_pdf_reports_clear_error_when_ocr_engine_is_missing(self):
        from fpdf import FPDF

        from app.services.document_parse_service import DocumentParseError, extract_text_from_bytes

        pdf = FPDF()
        pdf.add_page()
        data = bytes(pdf.output())

        with patch(
            "app.services.document_parse_service._ocr_pdf_text",
            side_effect=DocumentParseError("当前环境缺少 OCR 引擎 Tesseract。"),
            create=True,
        ):
            with self.assertRaises(DocumentParseError) as ctx:
                extract_text_from_bytes(data, "scan.pdf")

        self.assertIn("OCR 引擎", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
