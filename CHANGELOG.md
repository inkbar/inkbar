# Changelog

## [0.5.0](https://github.com/inkbar/inkbar/compare/v0.4.0...v0.5.0) (2026-10-21)


### Features

* build the sandbox's suggested redactions as an app extension ([#167](https://github.com/inkbar/inkbar/issues/167)) ([722f945](https://github.com/inkbar/inkbar/commit/722f9459f3922877dfb22e214ee886bf8f1218f7))
* clear the annotation selection on an empty press under select text ([#159](https://github.com/inkbar/inkbar/issues/159)) ([e07369f](https://github.com/inkbar/inkbar/commit/e07369fd11501bfbc115d8f83e17eb7cd4aa33f0))
* draw split buttons as one control ([#153](https://github.com/inkbar/inkbar/issues/153)) ([e6d41be](https://github.com/inkbar/inkbar/commit/e6d41be87840e4d350769e4d40fa14f849652d66))
* drop the suggestion card from the framework packages ([#168](https://github.com/inkbar/inkbar/issues/168)) ([0363b5e](https://github.com/inkbar/inkbar/commit/0363b5e54fda2acbb041640034a6b8ac033d1507))
* edit text boxes on a click and move them by their edge ([#160](https://github.com/inkbar/inkbar/issues/160)) ([5074170](https://github.com/inkbar/inkbar/commit/5074170b6d18faa95689b154ba532bfa7530cf8d))
* import callout, icon and font fields from PDF annotations ([#149](https://github.com/inkbar/inkbar/issues/149)) ([59de378](https://github.com/inkbar/inkbar/commit/59de3780bfb8023b3a3c9d0e18fb58233b32fc12))
* let apps decorate annotation elements and open their own popovers ([#165](https://github.com/inkbar/inkbar/issues/165)) ([1cdff3c](https://github.com/inkbar/inkbar/commit/1cdff3c22d2ef224477f7b06a7ac4749187c04c7))
* let apps redecorate annotations and give their popovers theme tokens ([#171](https://github.com/inkbar/inkbar/issues/171)) ([17962f2](https://github.com/inkbar/inkbar/commit/17962f2a9982b0d1b296f339d7ff899cb9da4c0a))
* look up PDF objects through the cross-reference ([#147](https://github.com/inkbar/inkbar/issues/147)) ([b652091](https://github.com/inkbar/inkbar/commit/b652091123afcf9fa9ea065f43d1b9f42a09dd1b))
* match cursors to what a press will do ([#162](https://github.com/inkbar/inkbar/issues/162)) ([7bbd25f](https://github.com/inkbar/inkbar/commit/7bbd25f6de8c7e683f9fbf6ef43305a4f3aff82c))
* move and resize what a creation tool just made ([#158](https://github.com/inkbar/inkbar/issues/158)) ([c4e8254](https://github.com/inkbar/inkbar/commit/c4e8254373eee2ca2ba9d1808722e2c82b3851ba))
* parse PDF object syntax and Flate streams ([#146](https://github.com/inkbar/inkbar/issues/146)) ([510ae7a](https://github.com/inkbar/inkbar/commit/510ae7a4a3f60a7508e9fcf3850d9ef508c6ace0))
* pass decorateAnnotation through the framework roots ([#166](https://github.com/inkbar/inkbar/issues/166)) ([aa9dfcf](https://github.com/inkbar/inkbar/commit/aa9dfcf29752f677239c86552f08d4bce05d1fef))
* read and write gloss documents ([#145](https://github.com/inkbar/inkbar/issues/145)) ([1217e57](https://github.com/inkbar/inkbar/commit/1217e57f5c6f0c6403287c643c7f5b8bf29963e6))
* read callout, icon and font fields from annotation dictionaries ([#148](https://github.com/inkbar/inkbar/issues/148)) ([5025a9b](https://github.com/inkbar/inkbar/commit/5025a9bb1a314d435d939d06fecfb9edff5c2bf6))
* remove suggested redactions from core and the theme ([#169](https://github.com/inkbar/inkbar/issues/169)) ([afc1ea0](https://github.com/inkbar/inkbar/commit/afc1ea079a18c8a2f7c16407e72c762e5b0a7c15))
* replace the sandbox sample with a tour of every annotation ([#156](https://github.com/inkbar/inkbar/issues/156)) ([74de738](https://github.com/inkbar/inkbar/commit/74de73842140026ad31479662ed942dff396d270))
* switch creation tools back to select text after use ([#157](https://github.com/inkbar/inkbar/issues/157)) ([5665f2c](https://github.com/inkbar/inkbar/commit/5665f2cec1d9673c9757177ed86e5c9fcd8bace4))
* widen the hit area of thin lines and borders ([#161](https://github.com/inkbar/inkbar/issues/161)) ([14ce8e5](https://github.com/inkbar/inkbar/commit/14ce8e53be23267ea28ee6a6eb680e235d6f8fe4))
* write inkbar's own data under custom.inkbar in gloss files ([#170](https://github.com/inkbar/inkbar/issues/170)) ([d151117](https://github.com/inkbar/inkbar/commit/d151117d1dcdd26b8c7d3d200f37f791d9f5664a))


### Bug Fixes

* fill the drag box with stars and polygons and honour arrowheads on new lines ([#144](https://github.com/inkbar/inkbar/issues/144)) ([d288d70](https://github.com/inkbar/inkbar/commit/d288d7087d492137089d79bdda5ae3453b7561ff))
* keep unknown font names and invalid PDF names out of imported annotations ([#150](https://github.com/inkbar/inkbar/issues/150)) ([3c83cfd](https://github.com/inkbar/inkbar/commit/3c83cfd34026ad8ead3b2945b8dbf0a2afa41096))
* line up split button menus and show the default markup colour ([#154](https://github.com/inkbar/inkbar/issues/154)) ([23d27d7](https://github.com/inkbar/inkbar/commit/23d27d70b9bada9071db1b520ba13c04f6138461))
* tidy edge cases in tool switching ([#163](https://github.com/inkbar/inkbar/issues/163)) ([1b2b400](https://github.com/inkbar/inkbar/commit/1b2b400e87650525e6b642bd7b25f75f5c354918))

## [0.4.0](https://github.com/inkbar/inkbar/compare/v0.3.0...v0.4.0) (2026-10-20)


### Features

* add a loupe ([#134](https://github.com/inkbar/inkbar/issues/134)) ([99a9eb2](https://github.com/inkbar/inkbar/commit/99a9eb234331ba4c190ad65ac46a9ee33fbe6007))
* add a mask ([#135](https://github.com/inkbar/inkbar/issues/135)) ([092ad5a](https://github.com/inkbar/inkbar/commit/092ad5ab1ab93de01e88f910873ebd8ef7313af5))
* add a pressure-aware draw tool ([#130](https://github.com/inkbar/inkbar/issues/130)) ([4bf0d6b](https://github.com/inkbar/inkbar/commit/4bf0d6b5d7154112020ca8d14e091630bc4a9c11))
* add a shapes tool and menu ([#126](https://github.com/inkbar/inkbar/issues/126)) ([074e95c](https://github.com/inkbar/inkbar/commit/074e95c6142b677ece74d4981a1cf1a60092a774))
* add a sketch tool that tidies strokes into shapes ([#131](https://github.com/inkbar/inkbar/issues/131)) ([3e3b709](https://github.com/inkbar/inkbar/commit/3e3b70950da4cf088b42ef1b596e3d93c8cdc78a))
* add a text box tool with in-place editing ([#127](https://github.com/inkbar/inkbar/issues/127)) ([4d65936](https://github.com/inkbar/inkbar/commit/4d65936835f41e688f751046e29c5cd7c63a8026))
* add a text style menu ([#128](https://github.com/inkbar/inkbar/issues/128)) ([52d8a40](https://github.com/inkbar/inkbar/commit/52d8a402294fd2050bad0d6aab78215c2b3be670))
* add border and fill colour menus ([#125](https://github.com/inkbar/inkbar/issues/125)) ([c60552e](https://github.com/inkbar/inkbar/commit/c60552e565a0434bef99146453e8e115799bca33))
* add comments on highlights and a highlight menu ([#132](https://github.com/inkbar/inkbar/issues/132)) ([d7b4139](https://github.com/inkbar/inkbar/commit/d7b4139aaeb322df708cd4f6e01821bd089af85f))
* add dashes and line endings with a line style menu ([#124](https://github.com/inkbar/inkbar/issues/124)) ([9eec2f4](https://github.com/inkbar/inkbar/commit/9eec2f44105d57e52782c9ddec5d7faf038e9508))
* add signatures ([#133](https://github.com/inkbar/inkbar/issues/133)) ([bbd41d4](https://github.com/inkbar/inkbar/commit/bbd41d4d73c0d06e742a04e66f86c22eedeb023d))
* add speech bubbles ([#129](https://github.com/inkbar/inkbar/issues/129)) ([1509aeb](https://github.com/inkbar/inkbar/commit/1509aeb288ebfea44be90330fec5fa819fcb8fce))
* import intents and note icons from PDFs ([#141](https://github.com/inkbar/inkbar/issues/141)) ([ba35350](https://github.com/inkbar/inkbar/commit/ba35350594c57a79a237037272003e7d99796107))
* keep speech bubbles and callout edits on standard callout fields ([#140](https://github.com/inkbar/inkbar/issues/140)) ([137af76](https://github.com/inkbar/inkbar/commit/137af76eea7764a49d4aa8cba0dbe703c5f5753d))
* let hosts register tools and share a tool style ([#121](https://github.com/inkbar/inkbar/issues/121)) ([2cf9944](https://github.com/inkbar/inkbar/commit/2cf9944b72b0bdc1c68dc80954c45b9e76589566))
* merge text and annotation selection into select-text ([#122](https://github.com/inkbar/inkbar/issues/122)) ([1d1db0e](https://github.com/inkbar/inkbar/commit/1d1db0e63417017b8008dcf1e10d7f5d2db6972c))
* spell PDF-derived values as PDF names and keep unknown ones ([#138](https://github.com/inkbar/inkbar/issues/138)) ([ded4157](https://github.com/inkbar/inkbar/commit/ded4157651bfc511c0ea58e575cfac92bc1bd4df))
* store and draw free-text callouts the standard way ([#139](https://github.com/inkbar/inkbar/issues/139)) ([a7af2ed](https://github.com/inkbar/inkbar/commit/a7af2ed1b4d8897f1e6568f4a1d74e72ee7c9849))


### Bug Fixes

* address review findings across the editor tools ([#136](https://github.com/inkbar/inkbar/issues/136)) ([8fbb881](https://github.com/inkbar/inkbar/commit/8fbb8819c373cd45542babe059ce341bd4d25df1))
* address review findings on PDF names and callouts ([#142](https://github.com/inkbar/inkbar/issues/142)) ([4fcd108](https://github.com/inkbar/inkbar/commit/4fcd1089e8a2201fa9e7e0c547c8f8b858b1e5e9))

## [0.3.0](https://github.com/inkbar/inkbar/compare/v0.2.0...v0.3.0) (2026-10-19)


### Features

* align annotation field names with XFDF ([#117](https://github.com/inkbar/inkbar/issues/117)) ([1c54400](https://github.com/inkbar/inkbar/commit/1c544000c08e9f3c47f1f4fe54447c2a64a3ac02))
* leave viewer state out of annotation exports ([#118](https://github.com/inkbar/inkbar/issues/118)) ([e4527fb](https://github.com/inkbar/inkbar/commit/e4527fb64facbb81980a07f7decec684b3674627))

## [0.2.0](https://github.com/inkbar/inkbar/compare/v0.1.1...v0.2.0) (2026-10-15)


### Features

* replace the default toolbar with composable toolbar controls ([#113](https://github.com/inkbar/inkbar/issues/113)) ([601bad9](https://github.com/inkbar/inkbar/commit/601bad9fb3867a6ebf848fea384a75173dc554c0))


### Bug Fixes

* credit Lucide for the zoom select chevron in the theme licence ([#115](https://github.com/inkbar/inkbar/issues/115)) ([cfa4dff](https://github.com/inkbar/inkbar/commit/cfa4dff593019479f98a98ef17df255d00c5c04d))
* ship the licence file in every package ([#112](https://github.com/inkbar/inkbar/issues/112)) ([1696a69](https://github.com/inkbar/inkbar/commit/1696a69669d2445d83f7f9332efacf92da73e5e2))

## [0.1.1](https://github.com/inkbar/inkbar/compare/v0.1.0...v0.1.1) (2026-10-15)


### Bug Fixes

* add repository details to the published packages ([#109](https://github.com/inkbar/inkbar/issues/109)) ([3a091d0](https://github.com/inkbar/inkbar/commit/3a091d06807deb4016fa2dadf79f95ec066dc7e0))

## 0.1.0 (2026-10-15)


### Features

* add keyboard editing, resize handles and a page error slot ([572027c](https://github.com/inkbar/inkbar/commit/572027c633b2743610eea628fff1d1a81b63d2b2))
* **core:** add a snapshot history for host-owned annotation lists ([cf85195](https://github.com/inkbar/inkbar/commit/cf8519579eaafa629ce786ddd5438f22dd7d6f73))
* **core:** add a Vite plugin that ships PDF.js assets from the host origin ([b8fca90](https://github.com/inkbar/inkbar/commit/b8fca9000c80c566a74832f6ffa99a8e2ae4b561))
* **core:** add createViewer, a framework-free viewer with default toolbar and popovers ([#85](https://github.com/inkbar/inkbar/issues/85)) ([11b6305](https://github.com/inkbar/inkbar/commit/11b6305a3f5018395410060866edd5069688aa3d))
* **core:** add geometry and state primitives ([3392939](https://github.com/inkbar/inkbar/commit/3392939b5278df1c5122bc3b85902c5d22e7ce19))
* **core:** add layout maths and the virtualised viewport ([8737ed3](https://github.com/inkbar/inkbar/commit/8737ed3426cacc98e116b643ed677c26f705329b))
* **core:** add mountViewer, the shared viewer wiring ([#84](https://github.com/inkbar/inkbar/issues/84)) ([27a799f](https://github.com/inkbar/inkbar/commit/27a799f5c59bd736cc6b2cab25477fe7bf0ca114))
* **core:** add note thread helpers ([2f64a6f](https://github.com/inkbar/inkbar/commit/2f64a6f90ff272250333930b7f28236f326e0ff0))
* **core:** add pdfjs loader with asset validation ([3f758b3](https://github.com/inkbar/inkbar/commit/3f758b34e8dabbb8dc0328078988726751c41e6f))
* **core:** add selection, highlight, redaction and note tools ([cdea520](https://github.com/inkbar/inkbar/commit/cdea520d6fd65fbdde7902deda8ef55c9a753f7d))
* **core:** add the annotation overlay with keyboard access and data attributes ([d1709c5](https://github.com/inkbar/inkbar/commit/d1709c5f54226b43c4f7d83837a3d835706bece9))
* **core:** add the annotation store and default colours ([820d26a](https://github.com/inkbar/inkbar/commit/820d26a1dad63cfb726102a11caaa6922cc72a55))
* **core:** add the page transform between user space and CSS pixels ([14a59f8](https://github.com/inkbar/inkbar/commit/14a59f8db631f3ffdd5f279fa828c97fd6a8daa1))
* **core:** add undo and redo history over the annotation store ([09d6140](https://github.com/inkbar/inkbar/commit/09d61409673d509da5f705f2ef856876fabf5b12))
* **core:** batch annotation changes into one undo step ([#81](https://github.com/inkbar/inkbar/issues/81)) ([2cd4cb1](https://github.com/inkbar/inkbar/commit/2cd4cb1742c645ed05056202097ddfb71df65ed6))
* **core:** define the annotation model and publish its JSON schema ([381d1a8](https://github.com/inkbar/inkbar/commit/381d1a897476f80a6002202c790e16cb2180b5a4))
* **core:** import and export annotations as JSON ([c97cfc7](https://github.com/inkbar/inkbar/commit/c97cfc7ae7a02dca546e607e439db9f4ec7dec4f))
* **core:** import embedded annotations from the PDF ([b23fd38](https://github.com/inkbar/inkbar/commit/b23fd387f202107e3f867f0f5f3c4dc964b20fe1))
* **core:** mount the text layer and map selections to user-space quads ([984d948](https://github.com/inkbar/inkbar/commit/984d9489a23eafb8dd1d13a945ab43d508e1d866))
* **core:** open documents and extract page geometry and text ([851db68](https://github.com/inkbar/inkbar/commit/851db686d791116259cd4ad241e29954f007def4))
* **core:** render pages to canvas with cancellation and DPR scaling ([382a215](https://github.com/inkbar/inkbar/commit/382a215b9b9469d0c127afe3bc85a3c0c6a2fdc7))
* **core:** share the popover focus return rules ([4a4217e](https://github.com/inkbar/inkbar/commit/4a4217ee8bc20963a2e949123d448f8eb4b9fca0))
* **core:** share tool labels, zoom levels, slot props and the overlay element resolver ([ef2b80e](https://github.com/inkbar/inkbar/commit/ef2b80e1ef2dd511f02d65bef6bed6376ef03c27))
* **demo:** add the demo app with a generated sample document ([#70](https://github.com/inkbar/inkbar/issues/70)) ([5facce0](https://github.com/inkbar/inkbar/commit/5facce01491e13dd65ea5260f4ef049f188bc4aa))
* **demo:** add the demo index page ([#77](https://github.com/inkbar/inkbar/issues/77)) ([3014277](https://github.com/inkbar/inkbar/commit/3014277e54a11f785292d4213ae8029f39c451f5))
* **demo:** add the framework-free TypeScript demo ([#76](https://github.com/inkbar/inkbar/issues/76)) ([be74ef8](https://github.com/inkbar/inkbar/commit/be74ef819063bc01b769f13fe03478bcf4d32bec))
* **demo:** add the page shell and the React demo ([#73](https://github.com/inkbar/inkbar/issues/73)) ([6a98885](https://github.com/inkbar/inkbar/commit/6a988852b084982610bdf45928c110bc82fa3b54))
* **demo:** add the redaction suggester and build-time source highlighting ([#71](https://github.com/inkbar/inkbar/issues/71)) ([ef7dc9e](https://github.com/inkbar/inkbar/commit/ef7dc9ef66f3e7845f35929c339a234404f19eb0))
* **demo:** add the Svelte demo ([#75](https://github.com/inkbar/inkbar/issues/75)) ([65642eb](https://github.com/inkbar/inkbar/commit/65642eb328531ab397f223954da0e298a9cfbb9d))
* **demo:** add the Vue demo ([#74](https://github.com/inkbar/inkbar/issues/74)) ([9d75cce](https://github.com/inkbar/inkbar/commit/9d75cce811ee37789088de092b0af03a6632aac2))
* **react,vue,svelte:** expose batched undo through useHistory ([#83](https://github.com/inkbar/inkbar/issues/83)) ([dd847c9](https://github.com/inkbar/inkbar/commit/dd847c984f5bdd1b8815366f775bc8e7c3c79cc1))
* **react:** add InkViewport, InkPage and InkAnnotation ([9fcc69a](https://github.com/inkbar/inkbar/commit/9fcc69a2802aa12579238d78b3f1a53ab82bfb0e))
* **react:** add the note popover and the suggestion card ([d701154](https://github.com/inkbar/inkbar/commit/d701154dd94e37f95c611651a7f85256d15b267c))
* **react:** add the toolbar primitives and the default toolbar ([2fb7632](https://github.com/inkbar/inkbar/commit/2fb76328728e2e42f02a67ea2584da19bbec4ced))
* **react:** scaffold the package with hooks and InkRoot ([a7dceee](https://github.com/inkbar/inkbar/commit/a7dceee1fc2854ff9bf7cceab4f0dff1ca8e02c9))
* **sandbox:** add a React review app that runs the shared suite ([817182c](https://github.com/inkbar/inkbar/commit/817182c5b4295ba51a71f8cdd13601e98707b9ee))
* **sandbox:** add a review app with accessibility and performance checks ([dc1dabf](https://github.com/inkbar/inkbar/commit/dc1dabff188d80ff0c606950183c704085374570))
* **sandbox:** add the Svelte review app on the shared end-to-end suite ([adef7eb](https://github.com/inkbar/inkbar/commit/adef7eba093764cf9680818c16979daba5a7f7fd))
* **sandbox:** restyle the home and framework pages ([#96](https://github.com/inkbar/inkbar/issues/96)) ([fdc48b6](https://github.com/inkbar/inkbar/commit/fdc48b667d7a96427fd46d95f024b86f124af902))
* **svelte:** add InkRoot with bindable models, the snapshot history and the test harness ([fc5cea5](https://github.com/inkbar/inkbar/commit/fc5cea54de3acb9b2135c990d87666b670fd1460))
* **svelte:** add InkViewport, InkPage and InkAnnotation with a portal attachment ([6f83d87](https://github.com/inkbar/inkbar/commit/6f83d877cb9bfa7fcccd45ece72aac7afb590702))
* **svelte:** add the document, annotation, tool, zoom, page and history hooks ([b811a5f](https://github.com/inkbar/inkbar/commit/b811a5f9df1d1fb86e19a29cd8615dd67c9d1161))
* **svelte:** add the note popover and the suggestion card ([1e5fa97](https://github.com/inkbar/inkbar/commit/1e5fa97261557b3fd057acc34d52fcbc33ed4eba))
* **svelte:** add the toolbar primitives and the default toolbar ([8b89ef9](https://github.com/inkbar/inkbar/commit/8b89ef915ed1371305697334fc5d3624455121c8))
* **svelte:** scaffold the package with its context and readable bridge ([7e71a3b](https://github.com/inkbar/inkbar/commit/7e71a3bb9466ed049ac5256fc735ca5ec5dfac9e))
* **theme:** add the zero-specificity default stylesheet ([c5b83db](https://github.com/inkbar/inkbar/commit/c5b83db86452bbf5df59502c9d3c281d6751dfaa))
* **vue:** add InkRoot with document identity, controlled annotations and composables ([cd57990](https://github.com/inkbar/inkbar/commit/cd579902c675f6a8aa88eca0ddf71c673217ce6b))
* **vue:** add InkViewport and InkPage with error, loading and annotation slots ([c5f4c1c](https://github.com/inkbar/inkbar/commit/c5f4c1c074d5e958acd09edf8a5b110a6618bd1b))
* **vue:** add toolbar primitives, note threads and suggestion cards ([8f44bb1](https://github.com/inkbar/inkbar/commit/8f44bb1fdca80c6a599caa423e56c41029ee0f3d))


### Bug Fixes

* **core,react,vue,svelte:** keep scroll on viewer rebuilds and tighten batched undo ([#90](https://github.com/inkbar/inkbar/issues/90)) ([6c21921](https://github.com/inkbar/inkbar/commit/6c2192106dc6e54310fb660893ffc3bcf436d211))
* **core:** apply UserUnit and harden the viewport and renderer ([546c606](https://github.com/inkbar/inkbar/commit/546c60698dc12df9a6f18a98facdb1cc41e2c6c5))
* **core:** compose controlled proposals on the pending list and harden tool gestures ([8152e0e](https://github.com/inkbar/inkbar/commit/8152e0e2ccb644a6a9462016bc98302710cb04cf))
* **core:** export JSON-safe copies and reserve rejected embedded ids ([999bd73](https://github.com/inkbar/inkbar/commit/999bd73edef617218e541216d492ad8effcef029))
* **core:** follow up review of selection quads and the overlay ([72f777f](https://github.com/inkbar/inkbar/commit/72f777fa16c122ef3bc892a374871a47bf7105b1))
* **core:** give controlled hosts two macrotasks to apply a proposal ([82373e2](https://github.com/inkbar/inkbar/commit/82373e23057c472a4397f16caf37f8b0e084ca97))
* **core:** harden annotation import, export and the embedded guard ([1647f10](https://github.com/inkbar/inkbar/commit/1647f10574b941ae0ccb0a04f90f2065cbe5c6e7))
* **core:** keep createViewer popovers in the viewer and rebuild below a gap ([#91](https://github.com/inkbar/inkbar/issues/91)) ([8568847](https://github.com/inkbar/inkbar/commit/856884711a2687ccb38d17b10e416251442a2547))
* **core:** pad annotation boxes once and keep blank lines in selections ([5b4a874](https://github.com/inkbar/inkbar/commit/5b4a8748f943db2a7804ba4f521be7281d3a2477))
* **demo:** handle failed and interrupted suggestions, tidy drops and copy ([#79](https://github.com/inkbar/inkbar/issues/79)) ([8a94f23](https://github.com/inkbar/inkbar/commit/8a94f231ecc688f97b1a8f40b1f3a70c166859eb))
* make core a peer dependency of the framework packages ([#101](https://github.com/inkbar/inkbar/issues/101)) ([70018ee](https://github.com/inkbar/inkbar/commit/70018ee107845c87bac89fc25e702d08953b5527))
* **react:** apply controlled lists in the same task and open once under StrictMode ([437c85d](https://github.com/inkbar/inkbar/commit/437c85dda809dca028713770722dca817707452b))
* **react:** final review fixes for class names, zoom buttons and test labels ([75544ab](https://github.com/inkbar/inkbar/commit/75544abd04bf2affb0866eb6a0ebdacf1c3c5d6c))
* **react:** memoise hook results, commit page input steps and guard unmounted roots ([6c9717d](https://github.com/inkbar/inkbar/commit/6c9717d0ca04ba36b25997e40676fd01ecbfe171))
* **sandbox:** forget a failed large-file generation so the next mount retries ([0ae550e](https://github.com/inkbar/inkbar/commit/0ae550ea74885399f8df0f01365e661f82ec30a5))
* **sandbox:** place suggested redactions by measured text width ([#107](https://github.com/inkbar/inkbar/issues/107)) ([86591c0](https://github.com/inkbar/inkbar/commit/86591c0db4585762f7b6a7c4f60f4d470afd94a7))
* **sandbox:** pre-bundle the PDF engine in every sandbox and recheck after the load tick ([59c7f14](https://github.com/inkbar/inkbar/commit/59c7f14fc4d39b95b49d588c86767dc75f519d3a))
* **svelte:** ship the date peer, scope the Svelte lint rules and tidy the review findings ([61aa1b3](https://github.com/inkbar/inkbar/commit/61aa1b37fd3fc76fe88ecafc68c9fc6a1de80e7e))
* **svelte:** tighten tests and types from the review backlog ([512ed5d](https://github.com/inkbar/inkbar/commit/512ed5dad164a2eb3810f14709ee5fd51eb7d62d))
* **theme:** keep light subtrees light under a dark ancestor and document token and layer rules ([37d2b43](https://github.com/inkbar/inkbar/commit/37d2b43206760d253164dec8331e0931f27c05fa))
* **vue,react:** ask a slow host once to drop an empty note and reset the draft at once ([98b1c7d](https://github.com/inkbar/inkbar/commit/98b1c7d7fad2ff0f604d04ff9032c21fa64c718b))
* **vue:** apply late annotation props, remount pages on rebuild and snapshot history by value ([7cf2655](https://github.com/inkbar/inkbar/commit/7cf2655bf895f319e8bced21ac2e7dde3e687968))
* **vue:** rebuild once when gap and the annotation slot change together ([#92](https://github.com/inkbar/inkbar/issues/92)) ([1a295d9](https://github.com/inkbar/inkbar/commit/1a295d90fb5c5c9ec38ed0c69ff560d14aeed513))
* **vue:** resolve full note threads and keep popover focus after removals ([99240dd](https://github.com/inkbar/inkbar/commit/99240dd454735738138292d018da83b307f60f4d))
