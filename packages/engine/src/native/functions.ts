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
  // (FPDF_DOCUMENT doc, float left, float bottom, float right, float top,
  //  const unsigned char* content, size_t content_len, int transparency_group)
  INK_Appearance_New: {
    args: ['ptr', 'f32', 'f32', 'f32', 'f32', 'ptr', 'i32', 'i32'],
    ret: 'ptr',
  },
  // (INK_APPEARANCE* a, const char* name, const char* base_font)
  INK_Appearance_AddFont: { args: ['ptr', 'ptr', 'ptr'], ret: 'i32' },
  // (INK_APPEARANCE* a, const char* name, float fill, float stroke)
  INK_Appearance_AddOpacity: { args: ['ptr', 'ptr', 'f32', 'f32'], ret: 'i32' },
  // (INK_APPEARANCE* a, const char* name, int format, const unsigned char* data, size_t len)
  INK_Appearance_AddImage: { args: ['ptr', 'ptr', 'i32', 'ptr', 'i32'], ret: 'i32' },
  // (INK_APPEARANCE* a, const char* name, int page_index)
  INK_Appearance_AddPage: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (INK_APPEARANCE* a, const char* name, INK_APPEARANCE* child)
  INK_Appearance_AddForm: { args: ['ptr', 'ptr', 'ptr'], ret: 'i32' },
  INK_Appearance_Free: { args: ['ptr'], ret: 'void' },
  // (FPDF_ANNOTATION annot, INK_APPEARANCE* a)
  INK_Annot_SetAppearance: { args: ['ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const unsigned char* json, size_t len)
  INK_Annot_SetData: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_PAGE page, FS_RECTF* rect)
  FPDF_GetPageBoundingBox: { args: ['ptr', 'ptr'], ret: 'i32' },
  // (FPDF_DOCUMENT document, FPDF_BOOL enabled)
  EPDF_SetRuntimeOwnerPermissions: { args: ['ptr', 'i32'], ret: 'i32' },
  // (FPDF_PAGE page, FPDF_ANNOTATION_SUBTYPE subtype)
  FPDFPage_CreateAnnot: { args: ['ptr', 'i32'], ret: 'ptr' },
  FPDFPage_CloseAnnot: { args: ['ptr'], ret: 'void' },
  // (FPDF_PAGE page, unsigned int obj_num); the handle is closed with FPDFPage_CloseAnnot
  EPDFPage_GetAnnotByObjectNumber: { args: ['ptr', 'i32'], ret: 'ptr' },
  // (FPDF_PAGE page, unsigned int obj_num)
  EPDFPage_RemoveAnnotByObjectNumber: { args: ['ptr', 'i32'], ret: 'i32' },
  // Not called here: the build's own check of the binary reads object numbers with it.
  EPDFAnnot_GetObjectNumber: { args: ['ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_RECTF* rect)
  FPDFAnnot_SetRect: { args: ['ptr', 'ptr'], ret: 'i32' },
  FPDFAnnot_SetFlags: { args: ['ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_BYTESTRING key, FPDF_WIDESTRING value)
  FPDFAnnot_SetStringValue: { args: ['ptr', 'ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_QUADPOINTSF* quad_points)
  FPDFAnnot_AppendAttachmentPoints: { args: ['ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_POINTF* points, size_t point_count)
  FPDFAnnot_AddInkStroke: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, float horizontal_radius, float vertical_radius, float border_width)
  FPDFAnnot_SetBorder: { args: ['ptr', 'f32', 'f32', 'f32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_ANNOT_BORDER_STYLE style, float width)
  EPDFAnnot_SetBorderStyle: { args: ['ptr', 'i32', 'f32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const float* dash_array, unsigned long count)
  EPDFAnnot_SetBorderDashPattern: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDFANNOT_COLORTYPE type, unsigned int R, G, B)
  EPDFAnnot_SetColor: { args: ['ptr', 'i32', 'i32', 'i32', 'i32'], ret: 'i32' },
  EPDFAnnot_SetOpacity: { args: ['ptr', 'f32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_POINTF* points, unsigned long count)
  EPDFAnnot_SetVertices: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_POINTF* start, const FS_POINTF* end)
  EPDFAnnot_SetLine: { args: ['ptr', 'ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_ANNOT_LINE_END start_style, FPDF_ANNOT_LINE_END end_style)
  EPDFAnnot_SetLineEndings: { args: ['ptr', 'i32', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_BYTESTRING intent)
  EPDFAnnot_SetIntent: { args: ['ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, const FS_POINTF* points, unsigned long count)
  EPDFAnnot_SetCalloutLine: { args: ['ptr', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_STANDARD_FONT font, float font_size, unsigned int R, G, B)
  EPDFAnnot_SetDefaultAppearance: {
    args: ['ptr', 'i32', 'f32', 'i32', 'i32', 'i32'],
    ret: 'i32',
  },
  // (FPDF_ANNOTATION annot, FPDF_TEXT_ALIGNMENT alignment)
  EPDFAnnot_SetTextAlignment: { args: ['ptr', 'i32'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_BYTESTRING key, FPDF_ANNOTATION linked_annot)
  EPDFAnnot_SetLinkedAnnot: { args: ['ptr', 'ptr', 'ptr'], ret: 'i32' },
  // (FPDF_ANNOTATION annot, FPDF_BYTESTRING name)
  EPDFAnnot_SetName: { args: ['ptr', 'ptr'], ret: 'i32' },
  // (FPDF_DOCUMENT document) -> EPDF_FORM_MODEL
  EPDFForm_LoadModel: { args: ['ptr'], ret: 'ptr' },
  EPDFForm_CloseModel: { args: ['ptr'], ret: 'void' },
  EPDFForm_CountFields: { args: ['ptr'], ret: 'i32' },
  // (EPDF_FORM_MODEL model, int field_index) -> uint32_t
  EPDFForm_GetFieldObjNum: { args: ['ptr', 'i32'], ret: 'i32' },
  // (model, int field_index, FPDF_WCHAR* buffer, unsigned long buflen) -> unsigned long
  EPDFForm_GetFieldName: { args: ['ptr', 'i32', 'ptr', 'i32'], ret: 'i32' },
  EPDFForm_GetFieldFamily: { args: ['ptr', 'i32'], ret: 'i32' },
  // (EPDF_FORM_MODEL model, int field_index) -> uint32_t, the effective /Ff flags
  EPDFForm_GetFieldFlags: { args: ['ptr', 'i32'], ret: 'i32' },
  // (EPDF_FORM_MODEL model, int field_index) -> int, an EPDF_FORM_VALUE_* shape of /V
  EPDFForm_GetFieldValueKind: { args: ['ptr', 'i32'], ret: 'i32' },
  // (EPDF_FORM_MODEL model, int field_index) -> int, the number of /Opt options
  EPDFForm_CountFieldOptions: { args: ['ptr', 'i32'], ret: 'i32' },
  // (model, int field_index, int option_index, FPDF_WCHAR* buffer, unsigned long buflen)
  //  -> unsigned long
  EPDFForm_GetFieldOptionValue: { args: ['ptr', 'i32', 'i32', 'ptr', 'i32'], ret: 'i32' },
  EPDFForm_CountFieldWidgets: { args: ['ptr', 'i32'], ret: 'i32' },
  // (model, int field_index, int widget_index, void* buffer, unsigned long buflen)
  EPDFForm_GetFieldWidgetOnState: {
    args: ['ptr', 'i32', 'i32', 'ptr', 'i32'],
    ret: 'i32',
  },
  // (FPDF_DOCUMENT document, uint32_t field_objnum, int kind,
  //  const FPDF_WIDESTRING* values, unsigned long value_count)
  EPDFForm_SetFieldValue: { args: ['ptr', 'i32', 'i32', 'ptr', 'i32'], ret: 'i32' },
  // (FPDF_DOCUMENT document, uint32_t field_objnum, const int* indices, unsigned long index_count)
  EPDFForm_SetFieldSelectedIndices: { args: ['ptr', 'i32', 'ptr', 'i32'], ret: 'i32' },
  // (document, uint32_t field_objnum, const FPDF_BOOL* checked, unsigned long checked_count,
  //  uint32_t* changed_widget_objnums, unsigned long buffer_size, unsigned long* out_changed_count)
  EPDFForm_SetFieldWidgetsChecked: {
    args: ['ptr', 'i32', 'ptr', 'i32', 'ptr', 'i32', 'ptr'],
    ret: 'i32',
  },
  // (document, uint32_t field_objnum, uint32_t* changed_widget_objnums,
  //  unsigned long buffer_size, unsigned long* out_changed_count)
  EPDFForm_RedrawFieldWidgets: { args: ['ptr', 'i32', 'ptr', 'i32', 'ptr'], ret: 'i32' },
  // (document, uint32_t field_objnum, FPDF_WIDESTRING appearance_text,
  //  uint32_t* changed_widget_objnums, unsigned long buffer_size, unsigned long* out_changed_count)
  EPDFForm_SetFieldAppearanceText: {
    args: ['ptr', 'i32', 'ptr', 'ptr', 'i32', 'ptr'],
    ret: 'i32',
  },
} as const satisfies Record<string, { args: readonly Kind[]; ret: Kind }>

type Returned<R extends Kind> = R extends 'void' ? void : number

export type Native = {
  [K in keyof typeof FUNCTIONS]: (
    ...args: number[]
  ) => Returned<(typeof FUNCTIONS)[K]['ret']>
}
