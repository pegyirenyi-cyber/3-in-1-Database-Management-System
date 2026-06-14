import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PDFGenerationResult {
  blob: Blob;
  filename: string;
}

export function replaceOklchInString(str: string): string {
  if (!str || !str.includes('oklch')) return str;
  const oklchRegex = /oklch\(\s*([0-9.]+%?)(?:\s+|\s*,\s*)([0-9.]+%?)(?:\s+|\s*,\s*)([0-9.deg]+)(?:\s*(?:\/|,)\s*([0-9.%]+))?\s*\)/gi;
  return str.replace(oklchRegex, (match, lStr, cStr, hStr, aStr) => {
    try {
      let l = lStr.endsWith('%') ? parseFloat(lStr) / 100 : parseFloat(lStr);
      let c = cStr.endsWith('%') ? parseFloat(cStr) / 100 : parseFloat(cStr);
      let h = hStr.endsWith('deg') ? parseFloat(hStr) : parseFloat(hStr);
      let a = 1;
      if (aStr) {
        if (aStr.endsWith('%')) {
          a = parseFloat(aStr) / 100;
        } else {
          a = parseFloat(aStr);
        }
      }

      if (isNaN(l)) l = 0;
      if (isNaN(c)) c = 0;
      if (isNaN(h)) h = 0;

      // OKLab conversion
      const hRad = (h * Math.PI) / 180;
      const a_lab = c * Math.cos(hRad);
      const b_lab = c * Math.sin(hRad);

      const l_lms = l + 0.3963377774 * a_lab + 0.2158037573 * b_lab;
      const m_lms = l - 0.1055613458 * a_lab - 0.0638541728 * b_lab;
      const s_lms = l - 0.0894841775 * a_lab - 1.2914855480 * b_lab;

      const l3 = l_lms * l_lms * l_lms;
      const m3 = m_lms * m_lms * m_lms;
      const s3 = s_lms * s_lms * s_lms;

      const r_lin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      const g_lin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      const b_lin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

      const f = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

      const r = Math.round(Math.max(0, Math.min(1, f(r_lin))) * 255);
      const g = Math.round(Math.max(0, Math.min(1, f(g_lin))) * 255);
      const b = Math.round(Math.max(0, Math.min(1, f(b_lin))) * 255);

      return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
    } catch (err) {
      console.warn("Failed to parse oklch color:", match, err);
      return match;
    }
  });
}

export const generatePdfFromHtml = async (
  elementId: string, 
  filename: string, 
  isLandscape: boolean = false
): Promise<PDFGenerationResult> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found for PDF generation.`);
  }

  // Backup original styles and functions to avoid leaking changes outside PDF export
  const originalGetComputedStyle = window.getComputedStyle;
  const originalGetPropertyValue = CSSStyleDeclaration.prototype.getPropertyValue;
  const originalGetAttribute = Element.prototype.getAttribute;

  const cssStyleDeclProto = CSSStyleDeclaration.prototype;
  const cssRuleProto = typeof CSSRule !== 'undefined' ? CSSRule.prototype : null;
  const cssStyleRuleProto = typeof CSSStyleRule !== 'undefined' ? CSSStyleRule.prototype : null;

  // Track modified descriptors so we can restore them perfectly
  const patchedDescriptors: { obj: any; prop: string; desc: PropertyDescriptor }[] = [];

  const patchProperty = (obj: any, prop: string, transform: (val: string) => string) => {
    if (!obj) return;
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc) {
        patchedDescriptors.push({ obj, prop, desc });
        const newDesc = { ...desc };
        if (desc.get) {
          newDesc.get = function() {
            const val = desc.get!.call(this);
            return typeof val === 'string' ? transform(val) : val;
          };
        } else if (typeof desc.value === 'string') {
          let currentVal = desc.value;
          newDesc.get = function() {
            return transform(currentVal);
          };
          if (desc.writable) {
            newDesc.set = function(v) {
              currentVal = v;
            };
          }
        }
        Object.defineProperty(obj, prop, newDesc);
      }
    } catch (e) {
      // Ignore
    }
  };

  // 1. Patch CSSStyleDeclaration.prototype.getPropertyValue
  CSSStyleDeclaration.prototype.getPropertyValue = function(property: string): string {
    const val = originalGetPropertyValue.call(this, property);
    if (typeof val === 'string' && val.includes('oklch')) {
      return replaceOklchInString(val);
    }
    return val;
  };

  // 2. Patch Element.prototype.getAttribute
  Element.prototype.getAttribute = function(name: string): string | null {
    const val = originalGetAttribute.call(this, name);
    if (typeof val === 'string' && val.includes('oklch')) {
      return replaceOklchInString(val);
    }
    return val;
  };

  // 3. Patch specific descriptors like cssText on prototype objects
  patchProperty(cssStyleDeclProto, 'cssText', replaceOklchInString);
  if (cssRuleProto) patchProperty(cssRuleProto, 'cssText', replaceOklchInString);
  if (cssStyleRuleProto) patchProperty(cssStyleRuleProto, 'cssText', replaceOklchInString);

  // 4. Dynamic prototype getter patching for CSSStyleDeclaration.prototype properties
  try {
    const allDeclProps = Object.getOwnPropertyNames(cssStyleDeclProto);
    for (const prop of allDeclProps) {
      if (prop !== 'getPropertyValue' && prop !== 'cssText') {
        const desc = Object.getOwnPropertyDescriptor(cssStyleDeclProto, prop);
        if (desc && desc.get) {
          patchProperty(cssStyleDeclProto, prop, replaceOklchInString);
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  // 5. Patch window.getComputedStyle using Proxy to intercept all properties dynamically (without illegal invocation)
  window.getComputedStyle = function(el: Element, pseudoElt?: string | null): CSSStyleDeclaration {
    const style = originalGetComputedStyle(el, pseudoElt);
    return new Proxy(style, {
      get(target, prop) {
        const val = Reflect.get(target, prop);
        if (typeof prop === 'string') {
          if (typeof val === 'string' && val.includes('oklch')) {
            return replaceOklchInString(val);
          }
        }
        if (typeof val === 'function') {
          return val.bind(target);
        }
        return val;
      }
    });
  };

  let canvas;
  try {
    // Capture element using html2canvas with high-DPI scaling
    canvas = await html2canvas(element, {
      scale: 2, 
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        // Prevent scrollbars or clipping in the cloned element to render full clean document
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          clonedElement.style.overflow = 'visible';
          clonedElement.style.overflowY = 'visible';
          clonedElement.style.overflowX = 'visible';
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';
          clonedElement.style.aspectRatio = undefined as any;
          // Ensure background is solid white for printable pages
          clonedElement.style.backgroundColor = '#ffffff';
        }

        // Convert all oklch colors in clone stylesheets
        const styleElements = clonedDoc.getElementsByTagName('style');
        for (let i = 0; i < styleElements.length; i++) {
          const style = styleElements[i];
          if (style.textContent && style.textContent.includes('oklch')) {
            style.textContent = replaceOklchInString(style.textContent);
          }
        }

        // Convert all oklch colors in inline style attributes of elements
        const allElements = clonedDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          const styleAttr = el.getAttribute('style');
          if (styleAttr && styleAttr.includes('oklch')) {
            el.setAttribute('style', replaceOklchInString(styleAttr));
          }
        }
      }
    });
  } finally {
    // Restore the browser APIs immediately after rendering concludes
    window.getComputedStyle = originalGetComputedStyle;
    CSSStyleDeclaration.prototype.getPropertyValue = originalGetPropertyValue;
    Element.prototype.getAttribute = originalGetAttribute;

    // Restore modified proto descriptors perfectly
    for (const { obj, prop, desc } of patchedDescriptors) {
      try {
        Object.defineProperty(obj, prop, desc);
      } catch (e) {
        // Ignore
      }
    }
  }

  const imgData = canvas.toDataURL('image/png', 1.0);
  
  const orientation = isLandscape ? 'l' : 'p';
  const pdf = new jsPDF({
    orientation: orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = isLandscape ? 297 : 210;
  const pdfHeight = isLandscape ? 210 : 297;

  // Setup margins
  const margin = 8;
  const imgWidth = pdfWidth - (margin * 2);
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pageHeight = pdfHeight;
  const printableHeight = pageHeight - (margin * 2);

  // If the document fits on one page (or is close enough with a tolerance of 15mm), center and scale it
  if (imgHeight <= printableHeight + 15) {
    const imageAspectRatio = canvas.width / canvas.height;
    const printableAspectRatio = imgWidth / printableHeight;

    let finalWidth = imgWidth;
    let finalHeight = imgHeight;

    if (imageAspectRatio > printableAspectRatio) {
      finalWidth = imgWidth;
      finalHeight = imgWidth / imageAspectRatio;
    } else {
      finalHeight = printableHeight;
      finalWidth = printableHeight * imageAspectRatio;
    }

    const posX = margin + (imgWidth - finalWidth) / 2;
    const posY = margin + (printableHeight - finalHeight) / 2;

    pdf.addImage(imgData, 'PNG', posX, posY, finalWidth, finalHeight);
  } else {
    // Multi-page slicing
    let heightLeft = imgHeight;
    let pageNum = 1;

    // Render the initial page slice starting from the top margin
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
    heightLeft -= printableHeight;

    // Add subsequent pages if the content overflows page height
    while (heightLeft > 0) {
      pdf.addPage();
      pageNum++;
      // Draw the image at a negative offset corresponding to the previous page's cutoff position
      const posY = margin - ((pageNum - 1) * printableHeight);
      pdf.addImage(imgData, 'PNG', margin, posY, imgWidth, imgHeight);
      heightLeft -= printableHeight;
    }
  }

  const blob = pdf.output('blob');
  return {
    blob,
    filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  };
};

export const downloadBlobLocally = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
