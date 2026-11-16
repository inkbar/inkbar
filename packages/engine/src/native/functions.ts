// Argument and return kinds for every function the WebAssembly build exports.
// This is a 32-bit build: pointers, size_t and unsigned long are all 32 bits.
type Kind = 'ptr' | 'i32' | 'f32' | 'void' | 'i64'

export const FUNCTIONS = {
  malloc: { args: ['i32'], ret: 'ptr' },
  free: { args: ['ptr'], ret: 'void' },
  INK_Init: { args: [], ret: 'void' },
  INK_Destroy: { args: [], ret: 'void' },
  // (FPDF_DOCUMENT doc, unsigned long flags) -> InkWriter*
  INK_Save: { args: ['ptr', 'i32'], ret: 'ptr' },
  INK_WriterData: { args: ['ptr'], ret: 'ptr' },
  INK_WriterSize: { args: ['ptr'], ret: 'i32' },
  INK_WriterFree: { args: ['ptr'], ret: 'void' },
  // (const void* data_buf, size_t size, FPDF_BYTESTRING password)
  FPDF_LoadMemDocument64: { args: ['ptr', 'i32', 'ptr'], ret: 'ptr' },
  FPDF_CloseDocument: { args: ['ptr'], ret: 'void' },
  FPDF_GetLastError: { args: [], ret: 'i32' },
  FPDF_GetPageCount: { args: ['ptr'], ret: 'i32' },
  FPDF_LoadPage: { args: ['ptr', 'i32'], ret: 'ptr' },
  FPDF_ClosePage: { args: ['ptr'], ret: 'void' },
  FPDF_GetPageWidthF: { args: ['ptr'], ret: 'f32' },
  FPDF_GetPageHeightF: { args: ['ptr'], ret: 'f32' },
  FPDFPage_GetRotation: { args: ['ptr'], ret: 'i32' },
  // (int width, int height, int format, void* first_scan, int stride)
  FPDFBitmap_CreateEx: { args: ['i32', 'i32', 'i32', 'ptr', 'i32'], ret: 'ptr' },
  // (bitmap, int left, int top, int width, int height, FPDF_DWORD color)
  FPDFBitmap_FillRect: { args: ['ptr', 'i32', 'i32', 'i32', 'i32', 'i32'], ret: 'i32' },
  FPDFBitmap_GetBuffer: { args: ['ptr'], ret: 'ptr' },
  FPDFBitmap_GetStride: { args: ['ptr'], ret: 'i32' },
  FPDFBitmap_Destroy: { args: ['ptr'], ret: 'void' },
  // (bitmap, page, int start_x, int start_y, int size_x, int size_y, int rotate, int flags)
  FPDF_RenderPageBitmap: {
    args: ['ptr', 'ptr', 'i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    ret: 'void',
  },
} as const satisfies Record<string, { args: readonly Kind[]; ret: Kind }>

export type Native = { [K in keyof typeof FUNCTIONS]: (...args: number[]) => number }
