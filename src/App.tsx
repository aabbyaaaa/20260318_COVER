import React, { useState, useEffect, useRef } from 'react';
import { Download, Image as ImageIcon, LayoutTemplate, Check } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- WCAG Color Contrast Utilities ---
const getLuminance = (r: number, g: number, b: number) => {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

const getContrastRatio = (l1: number, l2: number) => {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// 取得符合 WCAG AA (4.5:1) 或 AAA (7:1) 的深色系
const getSafeTextColor = (hex: string, targetContrast = 4.5) => {
  let rgb = hexToRgb(hex);
  if (!rgb) return '#333333';
  
  let { r, g, b } = rgb;
  let lum = getLuminance(r, g, b);
  const whiteLum = 1; // getLuminance(255, 255, 255)
  
  let contrast = getContrastRatio(whiteLum, lum);
  
  // 如果對比度不足，持續將顏色加深 (每次減少 10% 亮度)
  while (contrast < targetContrast && (r > 0 || g > 0 || b > 0)) {
    r = Math.max(0, Math.floor(r * 0.9));
    g = Math.max(0, Math.floor(g * 0.9));
    b = Math.max(0, Math.floor(b * 0.9));
    lum = getLuminance(r, g, b);
    contrast = getContrastRatio(whiteLum, lum);
  }
  
  const toHex = (c: number) => {
    const h = c.toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// 判斷背景色該配白色還是黑色文字 (對比度 >= 4.5 才能用白字)
const getContrastTextForBg = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const lum = getLuminance(rgb.r, rgb.g, rgb.b);
  const whiteContrast = getContrastRatio(1, lum);
  return whiteContrast >= 4.5 ? '#ffffff' : '#111827'; // gray-900
};
// -------------------------------------

const documentTypes = [
  { id: 'user_manual', zh: '使用說明書', en: 'User Manual' },
  { id: 'operation_manual', zh: '操作手冊', en: 'Operation Manual' },
  { id: 'product_catalog', zh: '產品型錄', en: 'Product Catalog' },
  { id: 'troubleshooting', zh: '故障排除指南', en: 'Troubleshooting Guide' }
];

export default function App() {
  const [formData, setFormData] = useState({
    companyLogoUrl: '',
    brandLogoUrl: '',
    brandName: 'WITEG',
    productNameZh: '高階智能分析儀器',
    productNameEn: 'Advanced Smart Analyzer Pro',
    originalModel: 'AX-9000-PRO',
    websiteModel: 'SmartAnalyzer-9000',
    category: 'Sample prep',
    documentType: 'user_manual',
    themeColor: '#0055a4', // 預設改為藍色以符合範例圖
    imageUrl: 'https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?auto=format&fit=crop&q=80&w=800&h=1000',
    transparentImageUrl: ''
  });

  const [selectedTemplate, setSelectedTemplate] = useState<'A' | 'B' | 'D' | 'E' | 'F' | 'G' | 'H'>('A');
  const [isDownloading, setIsDownloading] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.5);

  const displayImageUrl = formData.transparentImageUrl || formData.imageUrl;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, [field]: url }));
    }
  };

  // 監聽預覽容器寬度，動態計算縮放比例
  useEffect(() => {
    if (!previewContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // A4 寬度為 793.7px (96dpi)
        // 取得容器寬度，計算縮放比例
        const containerWidth = entry.contentRect.width;
        // 減去邊框寬度 (border-4 = 8px)
        const scale = (containerWidth - 8) / 793.7;
        setPreviewScale(scale);
      }
    });

    // 監聽第一個卡片的容器，因為它們寬度都一樣
    const firstCard = previewContainerRef.current.querySelector('.template-card-container');
    if (firstCard) {
      observer.observe(firstCard);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!formData.brandLogoUrl) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 縮小圖片以提升處理效能
      const MAX_SIZE = 100;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const imageData = ctx.getImageData(0, 0, width, height).data;
        const colorCounts: Record<string, { count: number, r: number, g: number, b: number }> = {};
        let maxCount = 0;
        let dominantColor = null;

        for (let i = 0; i < imageData.length; i += 4) {
          const red = imageData[i];
          const green = imageData[i + 1];
          const blue = imageData[i + 2];
          const alpha = imageData[i + 3];

          // 1. 略過透明像素
          if (alpha < 128) continue;
          
          // 2. 略過接近白色的背景像素
          if (red > 240 && green > 240 && blue > 240) continue;

          // 3. 顏色降階 (Quantization)：將相近的顏色歸類在一起 (容差值設為 24)
          const step = 24;
          const qR = Math.round(red / step) * step;
          const qG = Math.round(green / step) * step;
          const qB = Math.round(blue / step) * step;
          const key = `${qR},${qG},${qB}`;

          // 4. 判斷是否為灰階/黑灰色 (通常是 LOGO 旁邊的文字)
          const isGrayscale = Math.max(red, green, blue) - Math.min(red, green, blue) < 30;
          
          // 5. 權重計算：如果是彩色，給予較高的權重 (因為我們通常希望抓到品牌的「彩色」主色，而不是黑字)
          const weight = isGrayscale ? 1 : 10; 

          if (!colorCounts[key]) {
            colorCounts[key] = { count: 0, r: red, g: green, b: blue };
          }
          colorCounts[key].count += weight;

          if (colorCounts[key].count > maxCount) {
            maxCount = colorCounts[key].count;
            // 儲存該群組中第一次出現的原始顏色，讓色碼更精準
            dominantColor = colorCounts[key];
          }
        }

        if (dominantColor) {
          // 轉換為 HEX 色碼
          const toHex = (c: number) => {
            const hex = c.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          };
          const hex = `#${toHex(dominantColor.r)}${toHex(dominantColor.g)}${toHex(dominantColor.b)}`;
          setFormData(prev => ({ ...prev, themeColor: hex }));
        }
      } catch (e) {
        console.warn("無法分析圖片顏色", e);
      }
    };
    img.src = formData.brandLogoUrl;
  }, [formData.brandLogoUrl]);

  const handleDownloadPDF = async () => {
    if (!printAreaRef.current) return;
    
    try {
      setIsDownloading(true);
      
      // 確保元素在畫面中，避免 html2canvas 截圖不完整
      window.scrollTo(0, 0);
      
      // 使用 html2canvas 將 DOM 轉為 Canvas
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2, // 提高解析度
        useCORS: true, // 允許跨域圖片
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      // 建立 A4 尺寸的 PDF (210mm x 297mm)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // 將 Canvas 轉為圖片並加入 PDF
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      
      // 下載檔案
      const fileName = `${formData.brandName}_${formData.productNameZh}_封面.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error("PDF 產生失敗:", error);
      alert("產生 PDF 時發生錯誤，請稍後再試。");
    } finally {
      setIsDownloading(false);
    }
  };

  // 計算符合 WCAG 的安全文字顏色
  const safeTitleColor = getSafeTextColor(formData.themeColor, 3.0); // 大標題 (>= 18pt) WCAG AA 只需要 3:1
  const safeSubtitleColor = getSafeTextColor(formData.themeColor, 4.5); // 副標題 WCAG AA 需要 4.5:1
  const safeLabelColor = getSafeTextColor(formData.themeColor, 7.0); // 小標籤 WCAG AAA 需要 7:1 (當作深灰色使用)
  const tagTextColor = getContrastTextForBg(formData.themeColor); // 標籤文字顏色 (白或黑)

  const productNameSizeRem = formData.productNameZh.length > 12 ? 2.5 : formData.productNameZh.length > 10 ? 3 : 3.5;
  const brandNameSizeRem = productNameSizeRem * 0.8;
  const selectedDocType = documentTypes.find(t => t.id === formData.documentType) || documentTypes[0];

  // 渲染版型 A (經典漸層)
  const renderTemplateA = () => (
    <div 
      className="bg-white shadow-2xl relative flex flex-col overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm', padding: '40mm 20mm 20mm 20mm' }}
    >
      {/* Top Right Logo Shape */}
      <div
        className="absolute top-0 right-12 w-32 h-24 rounded-b-3xl flex items-center justify-center p-4 shadow-md z-20"
        style={{ backgroundColor: formData.themeColor }}
      >
        {formData.companyLogoUrl && (
          <img
            src={formData.companyLogoUrl}
            alt="Company Logo"
            className="max-w-full max-h-full object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {/* Product Image */}
      <div className="w-full flex justify-center mb-2 -mt-16 relative z-10">
        {formData.imageUrl ? (
          <img
            src={formData.imageUrl}
            alt="Product"
            className="max-w-full h-[500px] object-contain"
            style={{ mixBlendMode: 'multiply' }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-[500px] bg-gray-100 flex items-center justify-center text-gray-400 rounded-xl">
            <ImageIcon size={64} />
          </div>
        )}
      </div>

      {/* Category Pill & Line */}
      {formData.category && (
        <div className="flex items-center mb-6">
          <div
            className="relative z-10 px-4 py-0.5 rounded-full text-lg font-bold whitespace-nowrap"
            style={{ backgroundColor: formData.themeColor, color: tagTextColor }}
          >
            {formData.category}
          </div>
          <div
            className="flex-1 h-px -ml-2 relative z-0 origin-left"
            style={{ backgroundColor: formData.themeColor, transform: 'scaleY(0.25)' }}
          ></div>
        </div>
      )}

      {/* Titles */}
      <div className="mb-6">
        {/* Brand Name */}
        <div
          className="font-black mb-4 font-['Noto_Serif_TC',serif]"
          style={{ 
            color: formData.themeColor,
            fontSize: `${brandNameSizeRem}rem`,
            lineHeight: '1.2'
          }}
        >
          {formData.brandName}
        </div>

        {/* Main Title (Product Name Zh) */}
        <h1
          className="font-bold mb-6 leading-tight font-['Noto_Serif_TC',serif]"
          style={{ 
            color: formData.themeColor,
            fontSize: `${productNameSizeRem}rem`,
            lineHeight: '1.2'
          }}
        >
          {formData.productNameZh}
        </h1>

        {/* Gradient Divider */}
        <div
          className="h-2 w-full mb-6"
          style={{
            background: `linear-gradient(to right, ${formData.themeColor}, transparent)`
          }}
        ></div>

        {/* Subtitles */}
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold text-gray-600">
            {selectedDocType.zh}
          </h2>
          <p className="text-xl text-gray-600">
            {formData.brandName} {formData.productNameEn} - {selectedDocType.en}
          </p>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="absolute bottom-20 left-20 right-20 flex justify-between items-end">
        {/* Model Info */}
        <div className="flex flex-col">
          {formData.originalModel && (
            <div className="flex items-stretch text-xl">
              <span className="text-gray-500 w-20 py-1">原廠型號</span>
              <div className="w-[1.5px] bg-gray-300 mx-3"></div>
              <span className="font-bold py-1" style={{ color: formData.themeColor }}>
                {formData.originalModel}
              </span>
            </div>
          )}
          {formData.websiteModel && (
            <div className="flex items-stretch text-xl">
              <span className="text-gray-500 w-20 py-1">官網型號</span>
              <div className="w-[1.5px] bg-gray-300 mx-3"></div>
              <span className="font-bold py-1" style={{ color: formData.themeColor }}>
                {formData.websiteModel}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Right Logo */}
        <div>
          {formData.brandLogoUrl ? (
            <img
              src={formData.brandLogoUrl}
              alt="Brand Logo"
              className="h-16 object-contain"
              referrerPolicy="no-referrer"
            />
          ) : formData.companyLogoUrl ? (
            <img
              src={formData.companyLogoUrl}
              alt="Company Logo"
              className="h-16 object-contain"
              referrerPolicy="no-referrer"
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  // 渲染版型 B (左側灰底產品圖，右側文字)
  const renderTemplateB = () => (
    <div 
      className="bg-white shadow-2xl relative flex overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm' }}
    >
      {/* Left Column (Gray Background + Product Image) */}
      <div className="w-[35%] h-full bg-[#f3f4f6] flex items-center justify-center p-8 relative">
        {formData.imageUrl ? (
          <img
            src={formData.imageUrl}
            alt="Product"
            className="w-full object-contain relative z-10"
            style={{ mixBlendMode: 'multiply', transform: 'scale(2)' }} // CSS 魔法去背法 + 放大2倍
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full aspect-square bg-gray-200 flex items-center justify-center text-gray-400 rounded-xl">
            <ImageIcon size={64} />
          </div>
        )}
      </div>

      {/* Right Column (Text Content) */}
      <div className="w-[65%] h-full p-16 flex flex-col relative">
        
        {/* Top Right Logo Shape */}
        <div
          className="absolute top-0 right-16 w-24 h-32 rounded-b-full flex items-center justify-center p-4 shadow-md z-20"
          style={{ backgroundColor: formData.themeColor }}
        >
          {formData.companyLogoUrl && (
            <img
              src={formData.companyLogoUrl}
              alt="Company Logo"
              className="max-w-full max-h-full object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
              referrerPolicy="no-referrer"
            />
          )}
        </div>

        {/* Content Area (Pushed down to avoid logo) */}
        <div className="mt-32 flex flex-col flex-1">
          
          {/* Brand Name */}
          <div
            className="font-black mb-4 font-['Noto_Serif_TC',serif]"
            style={{ 
              color: formData.themeColor,
              fontSize: '3.5rem',
              lineHeight: '1.1'
            }}
          >
            {formData.brandName}
          </div>

          {/* Original Model (Large) */}
          <div className="text-4xl font-bold text-gray-800 mb-2 font-['Noto_Serif_TC',serif]">
            {formData.originalModel}
          </div>

          {/* Main Title (Product Name Zh) */}
          <h1
            className="font-bold mb-8 leading-tight font-['Noto_Serif_TC',serif]"
            style={{ 
              color: '#333333',
              fontSize: '2.5rem',
              lineHeight: '1.2'
            }}
          >
            {formData.productNameZh}
          </h1>

          {/* Subtitles */}
          <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-2xl font-bold text-gray-700">
              {selectedDocType.zh}
            </h2>
            <p className="text-lg text-gray-600 leading-snug">
              {formData.brandName} {formData.productNameEn} -<br />
              {selectedDocType.en}
            </p>
          </div>

          {/* Category Pill */}
          {formData.category && (
            <div className="mb-12">
              <span
                className="inline-block px-4 py-1.5 rounded text-lg font-bold"
                style={{ backgroundColor: formData.themeColor, color: tagTextColor }}
              >
                {formData.category}
              </span>
            </div>
          )}

          {/* Bottom Model Info */}
          <div className="mt-4 flex flex-col gap-3">
            {formData.originalModel && (
              <div className="flex items-center text-xl">
                <span className="text-gray-500 w-24">原廠型號</span>
                <div className="w-[1.5px] h-6 bg-gray-300 mx-4"></div>
                <span className="font-bold text-gray-800">
                  {formData.originalModel}
                </span>
              </div>
            )}
            {formData.websiteModel && (
              <div className="flex items-center text-xl">
                <span className="text-gray-500 w-24">官網型號</span>
                <div className="w-[1.5px] h-6 bg-gray-300 mx-4"></div>
                <span className="font-bold text-gray-800">
                  {formData.websiteModel}
                </span>
              </div>
            )}
          </div>

        </div>

        {/* Bottom Right Brand Logo */}
        <div className="absolute bottom-16 right-16">
          {formData.brandLogoUrl ? (
            <img
              src={formData.brandLogoUrl}
              alt="Brand Logo"
              className="h-12 object-contain"
              referrerPolicy="no-referrer"
            />
          ) : null}
        </div>

      </div>
    </div>
  );

  // 渲染版型 E (頂部曲線)
  const renderTemplateE = () => (
    <div 
      className="bg-white shadow-2xl relative flex flex-col overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm' }}
    >
      {/* Top Background */}
      <div 
        className="absolute top-0 left-0 w-full h-[65%]"
        style={{ backgroundColor: formData.themeColor }}
      >
        {/* Decorative Curves */}
        <svg className="absolute top-0 left-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0,0 L100,0 L100,100 C50,100 0,50 0,0 Z" fill="none" stroke="white" strokeWidth="0.5" />
          <path d="M0,20 C40,20 80,60 80,100 L0,100 Z" fill="none" stroke="white" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Top Right Content */}
      <div className="relative z-10 text-right p-16 text-white">
        <h1 className="text-6xl font-black mb-4 tracking-wider">{formData.productNameEn || 'PRODUCT'}</h1>
        <h2 className="text-4xl font-bold text-white/90">{formData.productNameZh}</h2>
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-0 left-0 w-full h-[35%] bg-white p-16 flex justify-between items-end">
        <div className="flex flex-col gap-4 w-1/2 z-20">
          <div className="text-2xl font-bold" style={{ color: formData.themeColor }}>
            {formData.category}
          </div>
          <div className="text-gray-600 text-lg">
            {selectedDocType.en} - {selectedDocType.zh}
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold text-gray-800">{formData.originalModel}</div>
            <div className="text-xl text-gray-500">{formData.websiteModel}</div>
          </div>
          {formData.companyLogoUrl && (
            <img src={formData.companyLogoUrl} alt="Logo" className="h-12 object-contain mt-8" referrerPolicy="no-referrer" />
          )}
        </div>
      </div>

      {/* Product Image */}
      <div className="absolute bottom-16 right-8 w-[55%] h-[60%] flex items-end justify-end z-10">
        {displayImageUrl && (
          <img 
            src={displayImageUrl} 
            alt="Product" 
            className="max-w-full max-h-full object-contain" 
            referrerPolicy="no-referrer" 
          />
        )}
      </div>
    </div>
  );

  // 渲染版型 F (頂部純色)
  const renderTemplateF = () => (
    <div 
      className="bg-white shadow-2xl relative flex flex-col overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm' }}
    >
      {/* Top Background */}
      <div 
        className="absolute top-0 left-0 w-full h-[55%]"
        style={{ backgroundColor: formData.themeColor }}
      ></div>

      {/* Top Content */}
      <div className="relative z-10 p-16 text-white w-2/3">
        <div className="text-lg mb-8 opacity-80 border-b border-white/30 pb-4">
          {formData.brandName} | {selectedDocType.en}
        </div>
        <h1 className="text-7xl font-black leading-tight tracking-tight uppercase">
          {formData.productNameEn || 'PRODUCT'}
        </h1>
        <h2 className="text-3xl mt-6 font-medium opacity-90">
          {formData.productNameZh}
        </h2>
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-16 left-16 z-20 flex flex-col gap-2">
        <div className="text-gray-400 text-sm tracking-widest uppercase">Model</div>
        <div className="text-2xl font-bold text-gray-800">{formData.originalModel}</div>
        <div className="text-lg text-gray-500">{formData.websiteModel}</div>
        {formData.companyLogoUrl && (
          <img src={formData.companyLogoUrl} alt="Logo" className="h-10 object-contain mt-4" referrerPolicy="no-referrer" />
        )}
      </div>

      {/* Product Image */}
      <div className="absolute bottom-12 right-12 w-[70%] h-[65%] flex items-end justify-end z-10">
        {displayImageUrl && (
          <img 
            src={displayImageUrl} 
            alt="Product" 
            className="max-w-full max-h-full object-contain" 
            referrerPolicy="no-referrer" 
          />
        )}
      </div>
    </div>
  );

  // 渲染版型 G (左側邊欄與圓形圖片)
  const renderTemplateG = () => (
    <div 
      className="bg-white shadow-2xl relative flex overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm' }}
    >
      {/* Left Sidebar */}
      <div 
        className="w-[40%] h-full text-white p-12 flex flex-col justify-between relative z-0"
        style={{ backgroundColor: formData.themeColor }}
      >
        <div className="mt-12">
          <div className="text-4xl font-black tracking-widest uppercase mb-4 opacity-90">
            {selectedDocType.en}
          </div>
          <div className="w-16 h-1 bg-white/50 mb-8"></div>
          <div className="text-xl opacity-80">{selectedDocType.zh}</div>
        </div>

        <div className="mb-12 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center text-sm">M</div>
            <div>
              <div className="text-xs opacity-70">Original Model</div>
              <div className="font-bold">{formData.originalModel}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full border border-white/50 flex items-center justify-center text-sm">W</div>
            <div>
              <div className="text-xs opacity-70">Website Model</div>
              <div className="font-bold">{formData.websiteModel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="w-[60%] h-full p-12 flex flex-col items-end relative z-0">
        {formData.companyLogoUrl && (
          <img src={formData.companyLogoUrl} alt="Logo" className="h-12 object-contain mb-auto" referrerPolicy="no-referrer" />
        )}
        
        <div className="mt-auto text-right mb-12">
          <div className="text-2xl font-bold text-gray-400 mb-2">{formData.brandName}</div>
          <h1 className="text-5xl font-black text-gray-800 mb-4">{formData.productNameZh}</h1>
          <h2 className="text-2xl text-gray-500">{formData.productNameEn}</h2>
        </div>
      </div>

      {/* Center Circular Image */}
      <div className="absolute top-1/2 left-[40%] -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-white shadow-2xl border-8 border-white overflow-hidden z-10 flex items-center justify-center p-8">
        {formData.imageUrl && (
          <img src={formData.imageUrl} alt="Product" className="max-w-full max-h-full object-contain" style={{ mixBlendMode: 'multiply' }} referrerPolicy="no-referrer" />
        )}
      </div>
    </div>
  );

  // 渲染版型 H (橫向色帶與圓形圖片)
  const renderTemplateH = () => (
    <div 
      className="bg-[#f8f9fa] shadow-2xl relative flex flex-col items-center overflow-hidden shrink-0"
      style={{ width: '210mm', height: '297mm' }}
    >
      {/* Top Logo */}
      <div className="w-full p-16 flex justify-center items-start h-[25%]">
        {formData.companyLogoUrl && (
          <img src={formData.companyLogoUrl} alt="Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
        )}
      </div>

      {/* Horizontal Band */}
      <div 
        className="w-full h-[20%] absolute top-[35%] left-0 z-0"
        style={{ backgroundColor: formData.themeColor, opacity: 0.8 }}
      ></div>

      {/* Center Circular Image */}
      <div 
        className="w-[400px] h-[400px] rounded-full bg-white shadow-xl z-10 flex items-center justify-center p-12 relative"
        style={{ border: `12px solid ${formData.themeColor}40` }} // 40 is hex for 25% opacity
      >
        {/* Inner border */}
        <div className="absolute inset-2 rounded-full border-2" style={{ borderColor: formData.themeColor }}></div>
        {displayImageUrl && (
          <img 
            src={displayImageUrl} 
            alt="Product" 
            className="max-w-full max-h-full object-contain relative z-20" 
            referrerPolicy="no-referrer" 
          />
        )}
      </div>

      {/* Bottom Content */}
      <div className="w-full p-16 flex flex-col items-center text-center mt-auto z-10">
        <div className="text-xl font-bold mb-2" style={{ color: formData.themeColor }}>
          {selectedDocType.en}
        </div>
        <h1 className="text-5xl font-black text-gray-800 mb-6 tracking-tight">
          {formData.productNameZh}
        </h1>
        <div className="flex gap-8 text-gray-600 border-t border-gray-300 pt-8 w-2/3 justify-center">
          <div className="flex flex-col items-center">
            <span className="text-sm text-gray-400 uppercase tracking-wider mb-1">Original</span>
            <span className="font-bold text-xl">{formData.originalModel}</span>
          </div>
          <div className="w-px bg-gray-300"></div>
          <div className="flex flex-col items-center">
            <span className="text-sm text-gray-400 uppercase tracking-wider mb-1">Website</span>
            <span className="font-bold text-xl">{formData.websiteModel}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar Form */}
      <div className="w-full md:w-96 bg-white border-r border-gray-200 p-6 overflow-y-auto flex flex-col gap-6 z-10 shadow-lg shrink-0">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
            <LayoutTemplate size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">PDF 封面產生器</h1>
            <p className="text-xs text-gray-500">A4 產品說明書封面設計</p>
          </div>
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">公司/品牌 LOGO (上傳圖片)</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'companyLogoUrl')} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">產品 LOGO (上傳圖片)</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'brandLogoUrl')} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">產品照片 (原圖)</label>
            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'imageUrl')} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100" />
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">
              產品照片 (去背 PNG)
              <a href="https://www.remove.bg/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline normal-case">
                https://www.remove.bg/
              </a>
            </label>
            <input type="file" accept="image/png" onChange={(e) => handleImageUpload(e, 'transparentImageUrl')} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100" />
          </div>
          
          <div className="border-t pt-4 mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">品牌名稱</label>
            <input type="text" name="brandName" value={formData.brandName} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
          </div>
          
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">產品名稱 (中文)</label>
            <input type="text" name="productNameZh" value={formData.productNameZh} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">產品名稱 (英文)</label>
            <input type="text" name="productNameEn" value={formData.productNameEn} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">原廠型號</label>
              <input type="text" name="originalModel" value={formData.originalModel} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">官網型號</label>
              <input type="text" name="websiteModel" value={formData.websiteModel} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">分類標籤</label>
            <input type="text" name="category" value={formData.category} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all" />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">文件類型</label>
            <select name="documentType" value={formData.documentType} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-all bg-white">
              {documentTypes.map(type => (
                <option key={type.id} value={type.id}>{type.zh} ({type.en})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wider">主題顏色</label>
            <div className="flex items-center gap-3">
              <input type="color" name="themeColor" value={formData.themeColor} onChange={handleChange} className="w-10 h-10 border-0 rounded-md cursor-pointer p-0" />
              <span className="text-sm text-gray-500 font-mono">{formData.themeColor}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className={`w-full mt-6 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
            isDownloading ? 'bg-gray-400 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          <Download size={18} />
          {isDownloading ? '正在產生 PDF...' : '下載選中的 PDF'}
        </button>
      </div>

      {/* Preview Area (Multiple Templates) */}
      <div className="flex-1 p-8 overflow-y-auto bg-gray-100">
        <div className="mb-6 max-w-[1400px] mx-auto">
          <h2 className="text-2xl font-bold text-gray-800">選擇封面版型</h2>
          <p className="text-gray-500 text-sm mt-1">點擊選擇您喜歡的排版，選中後點擊左下角下載 PDF。</p>
        </div>

        {/* Templates Grid */}
        <div ref={previewContainerRef} className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8 pb-12 max-w-[1400px] mx-auto">
          
          {/* Template A */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('A')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'A' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              {/* 使用 CSS Transform 縮放真實的 A4 內容以適應容器 */}
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}> {/* A4 size in pixels at 96dpi */}
                  {renderTemplateA()}
                </div>
              </div>
            </div>
            
            {/* Check Icon */}
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'A' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'A' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 A (經典漸層)
            </div>
          </div>

          {/* Template B */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('B')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'B' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}>
                  {renderTemplateB()}
                </div>
              </div>
            </div>
            
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'B' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'B' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 B (左側灰底)
            </div>
          </div>

          {/* Template E */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('E')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'E' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}>
                  {renderTemplateE()}
                </div>
              </div>
            </div>
            
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'E' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'E' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 E (頂部曲線)
            </div>
          </div>

          {/* Template F */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('F')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'F' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}>
                  {renderTemplateF()}
                </div>
              </div>
            </div>
            
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'F' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'F' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 F (頂部純色)
            </div>
          </div>

          {/* Template G */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('G')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'G' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}>
                  {renderTemplateG()}
                </div>
              </div>
            </div>
            
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'G' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'G' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 G (左側邊欄)
            </div>
          </div>

          {/* Template H */}
          <div 
            className="relative group cursor-pointer flex flex-col template-card-container"
            onClick={() => setSelectedTemplate('H')}
          >
            <div className={`
              w-full aspect-[210/297] bg-white rounded-xl overflow-hidden border-4 transition-all relative
              ${selectedTemplate === 'H' ? 'border-rose-500 shadow-xl' : 'border-transparent shadow-sm hover:border-gray-300 hover:shadow-md'}
            `}>
              <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                <div style={{ width: '793.7px', height: '1122.5px' }}>
                  {renderTemplateH()}
                </div>
              </div>
            </div>
            
            <div className={`
              absolute -top-4 -right-4 bg-rose-500 text-white rounded-full p-2 shadow-lg transition-transform duration-200
              ${selectedTemplate === 'H' ? 'scale-100' : 'scale-0'}
            `}>
              <Check size={24} strokeWidth={3} />
            </div>
            
            <div className={`text-center mt-4 text-lg transition-colors ${selectedTemplate === 'H' ? 'text-rose-600 font-bold' : 'text-gray-500 font-medium'}`}>
              版型 H (橫向色帶)
            </div>
          </div>

        </div>
      </div>

      {/* Hidden container for actual PDF generation */}
      <div className="fixed left-[200vw] top-0">
        <div ref={printAreaRef}>
          {selectedTemplate === 'A' && renderTemplateA()}
          {selectedTemplate === 'B' && renderTemplateB()}
          {selectedTemplate === 'E' && renderTemplateE()}
          {selectedTemplate === 'F' && renderTemplateF()}
          {selectedTemplate === 'G' && renderTemplateG()}
          {selectedTemplate === 'H' && renderTemplateH()}
        </div>
      </div>
    </div>
  );
}

