import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Printer, FileDown, Settings, Layout, Check, 
  HelpCircle, Eye, RefreshCw, FileText, Compass, Info
} from 'lucide-react';
import { getWatermarkHtml } from '../utils';
import { DbController } from '../db';
import { generatePdfFromHtml, downloadBlobLocally } from '../pdfHelper';

const GHANA_CREST_SVG = `
<svg viewBox="0 0 100 100" width="100%" height="100%" style="width: 420px; height: 420px; color: #0f172a;">
  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5" />
  <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" stroke-width="0.6" />
  <path d="M 32,32 L 68,32 C 68,32 68,58 50,74 C 32,58 32,32 32,32 Z" fill="none" stroke="currentColor" stroke-width="1.2" />
  <path d="M 50,32 L 50,74" stroke="currentColor" stroke-width="0.6" />
  <path d="M 32,50 L 68,50" stroke="currentColor" stroke-width="0.6" />
  <!-- Star in Center -->
  <polygon points="50,45 52,49 57,49 53,52 55,56 50,54 45,56 47,52 43,49 48,49" fill="currentColor" opacity="0.6" />
  <!-- Book (Top Right) -->
  <path d="M 53,36 L 65,36 L 65,46 L 53,46 Z" fill="none" stroke="currentColor" stroke-width="0.6" />
  <path d="M 53,41 L 65,41" stroke="currentColor" stroke-width="0.4" />
  <!-- Torch (Top Left) -->
  <line x1="41" y1="36" x2="41" y2="46" stroke="currentColor" stroke-width="1.2" />
  <circle cx="41" cy="35" r="1.2" fill="currentColor" />
  <!-- Laurel Wreath (Sides) -->
  <path d="M 23,35 C 19,48 19,63 34,74" fill="none" stroke="currentColor" stroke-width="0.6" />
  <path d="M 77,35 C 81,48 81,63 66,74" fill="none" stroke="currentColor" stroke-width="0.6" />
  <!-- Ribbon banner -->
  <path d="M 25,79 L 75,79 C 75,79 65,85 50,85 C 35,85 25,79 25,79 Z" fill="none" stroke="currentColor" stroke-width="0.6" />
  <text x="50" y="83" font-size="2.6" font-family="'Inter', sans-serif" font-weight="bold" text-anchor="middle" fill="currentColor" letter-spacing="0.3">KNOWLEDGE & CHARACTER</text>
  <text x="50" y="16" font-size="3.0" font-family="'Inter', sans-serif" font-weight="900" text-anchor="middle" fill="currentColor" letter-spacing="0.8">GHANA EDUCATION SERVICE</text>
</svg>
`;

const GHANA_CREST_HEADER_SVG = `
<svg viewBox="0 0 100 100" class="text-slate-800" style="width: 55px; height: 55px; margin-right: 15px; flex-shrink: 0; color: #1e293b;">
  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1" />
  <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" stroke-width="0.75" />
  <path d="M 32,32 L 68,32 C 68,32 68,58 50,74 C 32,58 32,32 32,32 Z" fill="none" stroke="currentColor" stroke-width="1.5" />
  <path d="M 50,32 L 50,74" stroke="currentColor" stroke-width="0.75" />
  <path d="M 32,50 L 68,50" stroke="currentColor" stroke-width="0.75" />
  <polygon points="50,45 52,49 57,49 53,52 55,56 50,54 45,56 47,52 43,49 48,49" fill="currentColor" />
  <path d="M 53,36 L 65,36 L 65,46 L 53,46 Z" fill="none" stroke="currentColor" stroke-width="0.75" />
  <path d="M 53,41 L 65,41" stroke="currentColor" stroke-width="0.5" />
  <line x1="41" y1="36" x2="41" y2="46" stroke="currentColor" stroke-width="1.5" />
  <circle cx="41" cy="35" r="1.5" fill="currentColor" />
  <path d="M 23,35 C 19,48 19,63 34,74" fill="none" stroke="currentColor" stroke-width="0.75" />
  <path d="M 77,35 C 81,48 81,63 66,74" fill="none" stroke="currentColor" stroke-width="0.75" />
  <path d="M 25,79 L 75,79 C 75,79 65,85 50,85 C 35,85 25,79 25,79 Z" fill="none" stroke="currentColor" stroke-width="0.75" />
  <text x="50" y="83" font-size="2.8" font-family="'Inter', sans-serif" font-weight="bold" text-anchor="middle" fill="currentColor" letter-spacing="0.5">KNOWLEDGE & CHARACTER</text>
  <text x="50" y="16" font-size="3.2" font-family="'Inter', sans-serif" font-weight="900" text-anchor="middle" fill="currentColor" letter-spacing="1">GHANA EDUCATION SERVICE</text>
</svg>
`;

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId?: string; // Target element to print
  customHtml?: string; // Alternatively direct HTML content
  documentTitle: string; // Title for the printed page / document
  isLandscapeDefault?: boolean;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  elementId,
  customHtml,
  documentTitle,
  isLandscapeDefault = false
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(isLandscapeDefault ? 'landscape' : 'portrait');
  const [paperSize, setPaperSize] = useState<'a4' | 'letter' | 'receipt'>('a4');
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'none'>('normal');
  const [customMargin, setCustomMargin] = useState<number>(48);
  const [includeOfficialHeader, setIncludeOfficialHeader] = useState<boolean>(true);
  const [includeSignatureLine, setIncludeSignatureLine] = useState<boolean>(true);
  const [includeWatermark, setIncludeWatermark] = useState<boolean>(true);
  const [hideStudentPhotos, setHideStudentPhotos] = useState<boolean>(false);
  const [includeBlankGrades, setIncludeBlankGrades] = useState<boolean>(true);
  const [forcePrintBackgrounds, setForcePrintBackgrounds] = useState<boolean>(true);
  const [fontSizeScale, setFontSizeScale] = useState<'small' | 'normal' | 'large'>('normal');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [previewContent, setPreviewContent] = useState<string>('');

  const previewFrameRef = useRef<HTMLDivElement>(null);
  const schoolInfo = DbController.getSchoolInfo();

  // Load and sanitize content
  useEffect(() => {
    if (!isOpen) return;

    if (elementId === 'fee-receipt-print-area' || elementId === 'fee-ledger-print-area') {
      setPaperSize('receipt');
      setOrientation('landscape');
      setMargins('none'); // Receipts and compact bills fit perfectly without external margins
    }

    let content = '';
    if (customHtml) {
      content = customHtml;
      setPreviewContent(content);
    } else if (elementId) {
      // Small timeout to ensure DOM is ready if triggered by a tab change
      const timer = setTimeout(() => {
        const el = document.getElementById(elementId);
        if (el) {
          setPreviewContent(el.innerHTML);
        } else {
          setPreviewContent(`<div class="p-8 text-center text-rose-600 font-medium">Error: Source element "${elementId}" not found for Print Preview.</div>`);
        }
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setPreviewContent('');
    }
  }, [isOpen, elementId, customHtml]);

  if (!isOpen) return null;

  // Render official header HTML
  const renderOfficialHeader = () => {
    if (!includeOfficialHeader) return '';
    const logoHtml = schoolInfo.logoUrl 
      ? `<img src="${schoolInfo.logoUrl}" style="height: 55px; max-width: 150px; object-fit: contain; margin-right: 15px;" />`
      : GHANA_CREST_HEADER_SVG;

    return `
      <div class="border-b-2 border-slate-900 pb-4 mb-6 flex items-center justify-between font-sans text-slate-900" style="font-family: 'Inter', sans-serif;">
        <div style="display: flex; align-items: center; gap: 15px;">
          ${logoHtml}
          <div>
            <h1 class="text-xl font-black uppercase tracking-tight text-slate-900 m-0" style="font-weight: 900; letter-spacing: -0.5px; line-height: 1.1;">${schoolInfo.name || 'SCHOOL MANAGEMENT SYSTEM'}</h1>
            <p class="text-xs text-slate-600 m-0 mt-1" style="font-weight: 500;">${schoolInfo.gpsAddress || 'Accra, Ghana'} | Tel: ${schoolInfo.telephone || 'N/A'}</p>
            <p class="text-xs text-slate-500 m-0" style="font-weight: 400;">${schoolInfo.email || ''}</p>
          </div>
        </div>
        <div class="text-right" style="text-align: right; min-width: 120px;">
          <span class="inline-block bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider" style="letter-spacing: 0.5px; font-weight: 800;">${documentTitle}</span>
          <p class="text-[10px] text-slate-500 m-0 mt-2" style="font-weight: 500;">Generated: ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
    `;
  };

  // Render official footer / signature lines
  const renderOfficialFooter = () => {
    if (!includeSignatureLine) return '';
    return `
      <div class="mt-12 pt-8 border-t border-dashed border-slate-300 flex justify-between text-xs text-slate-800" style="margin-top: 3rem; display: flex; justify-between: space-between; font-family: 'Inter', sans-serif;">
        <div style="flex: 1; text-align: left;">
          <p class="font-semibold text-slate-500 m-0">PREPARED BY:</p>
          <div class="w-40 border-b border-slate-900 mt-8 mb-1"></div>
          <p class="text-[10px] text-slate-600 m-0">Registrar / Academic Office</p>
        </div>
        <div style="flex: 1; text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <p class="font-semibold text-slate-500 m-0">APPROVED BY (PRINCIPAL):</p>
          <div class="w-40 border-b border-slate-900 mt-8 mb-1" style="border-bottom: 1px solid #000; width: 160px; margin-top: 32px; margin-bottom: 4px;"></div>
          <p class="text-[10px] text-slate-600 m-0">Signature & Official Stamp</p>
        </div>
      </div>
    `;
  };

  // Compile full document HTML for preview and printing
  const getCompiledHtml = (forIframe = false) => {
    const orientationStyle = paperSize === 'receipt' ? '@page { size: 220mm 110mm; margin: 0; }' : (orientation === 'landscape' ? '@page { size: landscape; }' : '@page { size: portrait; }');
    
    // Watermark styles - Elegant transparent school crest / logo background
    const watermarkHtml = includeWatermark 
      ? `
      ${getWatermarkHtml(schoolInfo?.crestUrl)}
      `
      : '';

    // Font size scaling
    const fontSizeBase = fontSizeScale === 'small' ? '12px' : fontSizeScale === 'large' ? '16px' : '14px';
    const fontSizeTable = fontSizeScale === 'small' ? '10px' : fontSizeScale === 'large' ? '13px' : '11.5px';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${documentTitle}</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
            
            ${orientationStyle}
            
            ${forcePrintBackgrounds ? `
            * {
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            ` : `
            * {
              -webkit-print-color-adjust: economy !important;
              color-adjust: economy !important;
              print-color-adjust: economy !important;
            }
            `}
            
            body {
              font-family: 'Inter', -apple-system, sans-serif;
              background-color: #ffffff !important;
              color: #0f172a !important;
              margin: 0 !important;
              padding: 0 !important;
              font-size: ${fontSizeBase};
            }

            .print-page {
              position: relative;
              background-color: #ffffff;
              box-sizing: border-box;
              min-height: 100vh;
              overflow: visible;
              padding: ${customMargin}px !important;
            }

            /* Hide elements based on toggles */
            ${hideStudentPhotos ? '.student-report-photo, .student-report-photo-placeholder, img[src*="photo"], .student-photo { display: none !important; }' : ''}
            ${!includeBlankGrades ? '.assessment-grade-empty { display: none !important; }' : ''}

            /* Strip out any typical navigation / action elements if copied over */
            .no-print, button, .btn, .nav, .sidebar, .actions-row, [data-html2canvas-ignore] {
              display: none !important;
            }

            /* Better table styling for prints */
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              page-break-inside: auto !important;
              font-size: ${fontSizeTable};
            }
            tr {
              page-break-inside: avoid !important;
              page-break-after: auto !important;
            }
            thead {
              display: table-header-group !important;
            }
            tfoot {
              display: table-footer-group !important;
            }
            
            /* High contrast headers */
            th {
              background-color: #f1f5f9 !important;
              color: #0f172a !important;
              border-bottom: 2px solid #cbd5e1 !important;
              font-weight: 700 !important;
            }
            td, th {
              padding: 8px 12px !important;
              border: 1px solid #e2e8f0 !important;
            }

            /* Ensure SVGs and QR codes render with proper size and color */
            svg {
              max-width: 100%;
              height: auto;
              display: inline-block;
            }
            
            #student-qr-print-area svg, #bulk-qr-print-area svg {
              width: 180px !important;
              height: 180px !important;
            }

            @media print {
              html, body {
                width: 100%;
                height: auto;
                background-color: #ffffff !important;
              }
              .print-page {
                border: none !important;
                box-shadow: none !important;
                margin: 0 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-page">
            ${watermarkHtml}
            ${renderOfficialHeader()}
            <div class="document-body-content relative z-10">
              ${previewContent}
            </div>
            ${renderOfficialFooter()}
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    setIsLoading(true);
    try {
      // 1. Create temporary iframe to guarantee separate print document context (blocks blank sheet bugs!)
      const existingFrame = document.getElementById('sms-print-iframe');
      if (existingFrame) {
        existingFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'sms-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(getCompiledHtml(true));
        doc.close();

        // 2. Wait for content and styles to fully load, then print
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Iframe print triggered exception:", e);
            // Fallback
            window.print();
          } finally {
            setIsLoading(false);
          }
        }, 800);
      } else {
        throw new Error("Could not access iframe document");
      }
    } catch (err) {
      console.warn("Direct print system fallback:", err);
      window.print();
      setIsLoading(false);
    }
  };

  const handlePdfDownload = async () => {
    setIsLoading(true);
    try {
      // Create a temporary element in the body to render the compiled content for html2canvas
      const tempDiv = document.createElement('div');
      tempDiv.id = 'temp-pdf-render-area';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = orientation === 'landscape' ? '1120px' : '800px';
      tempDiv.innerHTML = `
        <div class="bg-white text-slate-900 border border-slate-200" style="padding: ${customMargin}px !important;">
          ${renderOfficialHeader()}
          <div>${previewContent}</div>
          ${renderOfficialFooter()}
        </div>
      `;
      document.body.appendChild(tempDiv);

      const result = await generatePdfFromHtml(
        'temp-pdf-render-area',
        `${documentTitle.replace(/\s+/g, '_')}_Layout`,
        orientation === 'landscape'
      );
      
      downloadBlobLocally(result.blob, result.filename);
      document.body.removeChild(tempDiv);
    } catch (err) {
      console.error("PDF generator failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl flex flex-col w-full max-w-6xl h-[90vh]"
      >
        {/* Header Ribbon */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <Printer size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Print Preview & Document Layout Align</h2>
              <p className="text-xs text-slate-400">Optimize margins, branding, and paper size before submitting to printer</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Settings Sidebar */}
          <div className="w-full lg:w-80 bg-slate-950/40 border-b lg:border-b-0 lg:border-r border-slate-800 p-6 space-y-6 overflow-y-auto no-print">
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layout size={12} className="text-indigo-400" /> Page Layout
              </h3>
              
              {/* Orientation */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400">Orientation</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setOrientation('portrait')}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                      orientation === 'portrait' 
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Portrait
                  </button>
                  <button 
                    type="button"
                    onClick={() => setOrientation('landscape')}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                      orientation === 'landscape' 
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Landscape
                  </button>
                </div>
              </div>

              {/* Paper Size */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400">Paper Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['a4', 'letter', 'receipt'] as const).map(size => (
                    <button 
                      key={size}
                      type="button"
                      onClick={() => setPaperSize(size)}
                      className={`py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition ${
                        paperSize === size 
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400">Page Margins Preset</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['normal', 'narrow', 'none'] as const).map(margin => (
                    <button 
                      key={margin}
                      type="button"
                      onClick={() => {
                        setMargins(margin);
                        setCustomMargin(margin === 'none' ? 0 : margin === 'narrow' ? 24 : 48);
                      }}
                      className={`py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition ${
                        margins === margin 
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {margin}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Margin Slider */}
              <div className="space-y-1.5 p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-semibold text-slate-300">Custom Margin (Padding)</span>
                  <span className="font-mono font-bold text-emerald-400">{customMargin}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="2"
                  value={customMargin}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCustomMargin(val);
                    // Reset preset selected state if it doesn't match standard sizes
                    if (val === 0) setMargins('none');
                    else if (val === 24) setMargins('narrow');
                    else if (val === 48) setMargins('normal');
                    else setMargins('' as any); // clear preset selection
                  }}
                  className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                  <span>0px (None)</span>
                  <span>48px (Normal)</span>
                  <span>120px (Wide)</span>
                </div>
              </div>
            </div>

            <hr className="border-slate-800" />

            {/* Document Branding options */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Settings size={12} className="text-emerald-400" /> Document Settings
              </h3>

              {/* Official Header */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Official Header</span>
                  <span className="text-[9px] text-slate-500">Inject School Crest & Address</span>
                </div>
                <input 
                  type="checkbox"
                  checked={includeOfficialHeader}
                  onChange={(e) => setIncludeOfficialHeader(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Signature Line */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Signature Line</span>
                  <span className="text-[9px] text-slate-500">Add Principal & Registrar lines</span>
                </div>
                <input 
                  type="checkbox"
                  checked={includeSignatureLine}
                  onChange={(e) => setIncludeSignatureLine(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Watermark */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Watermark</span>
                  <span className="text-[9px] text-slate-500">Add faint "OFFICIAL" background</span>
                </div>
                <input 
                  type="checkbox"
                  checked={includeWatermark}
                  onChange={(e) => setIncludeWatermark(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Hide Student Photos */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Hide Student Photos</span>
                  <span className="text-[9px] text-slate-500">Remove portrait images</span>
                </div>
                <input 
                  type="checkbox"
                  checked={hideStudentPhotos}
                  onChange={(e) => setHideStudentPhotos(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Include Blank Grades */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Include Blank Grades</span>
                  <span className="text-[9px] text-slate-500">Show rows without scores</span>
                </div>
                <input 
                  type="checkbox"
                  checked={includeBlankGrades}
                  onChange={(e) => setIncludeBlankGrades(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Print Backgrounds */}
              <label className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 cursor-pointer select-none">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-300">Print Backgrounds</span>
                  <span className="text-[9px] text-slate-500">Force colors and patterns</span>
                </div>
                <input 
                  type="checkbox"
                  checked={forcePrintBackgrounds}
                  onChange={(e) => setForcePrintBackgrounds(e.target.checked)}
                  className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
              </label>

              {/* Font Size Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400">Document Font Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['small', 'normal', 'large'] as const).map(size => (
                    <button 
                      key={size}
                      type="button"
                      onClick={() => setFontSizeScale(size)}
                      className={`py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition ${
                        fontSizeScale === size 
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
                <Info size={10} className="text-indigo-400" /> Print Alignment Rule
              </span>
              <p className="text-[10px] leading-relaxed text-slate-500">
                To guarantee zero empty pages, we isolate document rendering in a separate headless element, discarding sidebar panels and dashboard background themes automatically.
              </p>
            </div>
          </div>

          {/* Paper Canvas Preview Area */}
          <div className="flex-1 bg-slate-950 p-6 overflow-y-auto flex justify-center items-start">
            <div 
              className={`bg-white text-slate-900 shadow-2xl transition-all duration-300 origin-top overflow-visible relative ${
                paperSize === 'receipt' 
                  ? 'w-[831px] min-h-[416px]' // DL Envelope size (roughly 220x110mm)
                  : orientation === 'landscape' 
                    ? 'w-[840px] min-h-[595px]' 
                    : 'w-[595px] min-h-[840px]'
              }`}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: fontSizeScale === 'small' ? '10px' : fontSizeScale === 'large' ? '13px' : '11px',
                lineHeight: '1.5',
                padding: `${customMargin}px`
              }}
            >
              {/* Preview watermarks */}
              {includeWatermark && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0" dangerouslySetInnerHTML={{ __html: getWatermarkHtml(schoolInfo?.crestUrl) }} />
              )}

              <style dangerouslySetInnerHTML={{ __html: `
                ${hideStudentPhotos ? '.student-report-photo, .student-report-photo-placeholder, img[src*="photo"], .student-photo { display: none !important; }' : ''}
                ${!includeBlankGrades ? '.assessment-grade-empty { display: none !important; }' : ''}
              `}} />

              {/* Dynamic Header */}
              {includeOfficialHeader && (
                <div className="border-b-2 border-slate-900 pb-4 mb-6 flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    {schoolInfo.logoUrl ? (
                      <img src={schoolInfo.logoUrl} className="h-10 w-auto object-contain" alt="School Logo" />
                    ) : (
                      <div className="h-10 w-10 flex-shrink-0" dangerouslySetInnerHTML={{ __html: GHANA_CREST_HEADER_SVG.replace('width: 55px; height: 55px;', 'width: 40px; height: 40px;') }} />
                    )}
                    <div>
                      <h1 className="text-sm font-black uppercase text-slate-900 leading-none tracking-tight">
                        {schoolInfo.name || 'SCHOOL MANAGEMENT SYSTEM'}
                      </h1>
                      <p className="text-[8px] text-slate-600 mt-0.5 leading-none font-medium">
                        {schoolInfo.gpsAddress || 'Accra, Ghana'} | Tel: {schoolInfo.telephone || 'N/A'}
                      </p>
                      <p className="text-[8px] text-slate-500 leading-none mt-0.5">{schoolInfo.email || ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-slate-900 text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                      {documentTitle}
                    </span>
                    <p className="text-[8px] text-slate-500 mt-1">Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              )}

              {/* Actual Content Wrapper */}
              <div 
                className="document-live-preview-box relative z-10"
                dangerouslySetInnerHTML={{ __html: previewContent }}
              />

              {/* Dynamic Footer */}
              {includeSignatureLine && (
                <div className="mt-12 pt-6 border-t border-dashed border-slate-300 flex justify-between relative z-10 text-[9px]">
                  <div>
                    <p className="font-bold text-slate-500 uppercase tracking-wider">Prepared By:</p>
                    <div className="w-32 border-b border-slate-900 mt-6 mb-1"></div>
                    <p className="text-[8px] text-slate-400">Registrar / Academic Office</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className="font-bold text-slate-500 uppercase tracking-wider">Approved By (Principal):</p>
                    <div className="w-32 border-b border-slate-900 mt-6 mb-1"></div>
                    <p className="text-[8px] text-slate-400">Signature & Official Stamp</p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer Action Ribbon */}
        <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between no-print">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
          >
            Cancel & Exit
          </button>
          
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={handlePdfDownload}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              <FileDown size={14} />
              Save PDF Document
            </button>
            <button 
              type="button"
              onClick={handlePrint}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/10 transition disabled:opacity-50"
            >
              <Printer size={14} />
              {isLoading ? 'Preparing Layout...' : 'Confirm & Print Now'}
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
};
