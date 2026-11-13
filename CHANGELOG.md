# Changelog

## [0.15.0](https://github.com/inkbar/inkbar/compare/v0.14.0...v0.15.0) (2026-11-13)


### Features

* **core:** accept label functions from hosts and plugins ([#381](https://github.com/inkbar/inkbar/issues/381)) ([ac9f503](https://github.com/inkbar/inkbar/commit/ac9f5039e89107f9c295b4d97ef62af3055d4919))
* **core:** add French and German ([#385](https://github.com/inkbar/inkbar/issues/385)) ([3ed69f1](https://github.com/inkbar/inkbar/commit/3ed69f1d0e17f3c468962b93ddb8f679cdabb4ae))
* **core:** add messages with English defaults ([#378](https://github.com/inkbar/inkbar/issues/378)) ([0d64304](https://github.com/inkbar/inkbar/commit/0d6430439b20850b95a6ffb87ea917d8f288ec3c))
* **core:** label the viewer chrome from messages ([#380](https://github.com/inkbar/inkbar/issues/380)) ([1fe4045](https://github.com/inkbar/inkbar/commit/1fe404512e842460ab3a00eda99a8c8d3f5c51be))
* **core:** take messages and locale in the viewer ([#379](https://github.com/inkbar/inkbar/issues/379)) ([aac4787](https://github.com/inkbar/inkbar/commit/aac4787b4c32bcce9c37e7a4eb855e3a76fce6e4))
* **react:** take messages and locale on InkRoot ([#383](https://github.com/inkbar/inkbar/issues/383)) ([63f7205](https://github.com/inkbar/inkbar/commit/63f720538bcac328d5e04b331b5e87656434ef66))
* **sandbox:** switch the viewer language ([#386](https://github.com/inkbar/inkbar/issues/386)) ([2d2d7c3](https://github.com/inkbar/inkbar/commit/2d2d7c37550af001a968147aaf85f5e5ee4c1369))
* **svelte:** take messages and locale on InkRoot ([#384](https://github.com/inkbar/inkbar/issues/384)) ([d642a13](https://github.com/inkbar/inkbar/commit/d642a13858da63a56526d99500ba228b8cbfc44d))
* **vue:** take messages and locale on InkRoot ([#382](https://github.com/inkbar/inkbar/issues/382)) ([a78731e](https://github.com/inkbar/inkbar/commit/a78731e0768a07fd5017830d92dac46ee646f6da))


### Bug Fixes

* harden translations after review ([#388](https://github.com/inkbar/inkbar/issues/388)) ([71eb109](https://github.com/inkbar/inkbar/commit/71eb10936a3f4e63df077bca0f7ea11e868d2df6))

## [0.14.0](https://github.com/inkbar/inkbar/compare/v0.13.0...v0.14.0) (2026-11-12)


### Features

* add a locked status and a password prompt controller ([#367](https://github.com/inkbar/inkbar/issues/367)) ([1021c8d](https://github.com/inkbar/inkbar/commit/1021c8d206914fb284a5adaf88fa0ed712a31c2c))
* ask for the password of a locked file ([#368](https://github.com/inkbar/inkbar/issues/368)) ([b2f206d](https://github.com/inkbar/inkbar/commit/b2f206d2c4e6dcbe54de65ab9191a69e0da33067))
* **react:** ask for the password of a locked file ([#370](https://github.com/inkbar/inkbar/issues/370)) ([7f6b9ce](https://github.com/inkbar/inkbar/commit/7f6b9cead35652a03124548b55d2714a2e40f2b0))
* **sandbox:** add a locked file scenario ([#372](https://github.com/inkbar/inkbar/issues/372)) ([5edce71](https://github.com/inkbar/inkbar/commit/5edce71a431d0b8138cb7d339a3d4e5860341766))
* **svelte:** ask for the password of a locked file ([#371](https://github.com/inkbar/inkbar/issues/371)) ([a411ed6](https://github.com/inkbar/inkbar/commit/a411ed68c891d30686c714a17fb8382c8c9f3fe3))
* **vue:** ask for the password of a locked file ([#369](https://github.com/inkbar/inkbar/issues/369)) ([077231a](https://github.com/inkbar/inkbar/commit/077231ab24593ade9eddd1b65afed4f9bb3c106e))


### Bug Fixes

* keep focus and pending state right around the password prompt ([#373](https://github.com/inkbar/inkbar/issues/373)) ([13e564c](https://github.com/inkbar/inkbar/commit/13e564c9c6bafc4115c9989c4b380223a6f1864e))

## [0.13.0](https://github.com/inkbar/inkbar/compare/v0.12.0...v0.13.0) (2026-11-12)


### Features

* close a floating sidebar panel on a tap on the pages or Escape ([#351](https://github.com/inkbar/inkbar/issues/351)) ([9dee314](https://github.com/inkbar/inkbar/commit/9dee3141ef2f9ce458e0a18e49ccdb74dbba01d9))
* decide which sidebars float when the document runs out of room ([#348](https://github.com/inkbar/inkbar/issues/348)) ([f391c96](https://github.com/inkbar/inkbar/commit/f391c962f168baa786499fc4570bb419da906900))
* float a rail sidebar over the pages when the document runs out of room ([#350](https://github.com/inkbar/inkbar/issues/350)) ([f3c229f](https://github.com/inkbar/inkbar/commit/f3c229fd0181b6a3c5d5fd7c89087542914f8c60))
* float sidebars in React ([#354](https://github.com/inkbar/inkbar/issues/354)) ([d877a9c](https://github.com/inkbar/inkbar/commit/d877a9cd6b3333388cdb2f9274450aa30d91dab2))
* float sidebars in Svelte ([#355](https://github.com/inkbar/inkbar/issues/355)) ([408fc7f](https://github.com/inkbar/inkbar/commit/408fc7fe0537414a2a74ef9ef64a4c3e830f3b19))
* float sidebars in Vue ([#353](https://github.com/inkbar/inkbar/issues/353)) ([f0983e6](https://github.com/inkbar/inkbar/commit/f0983e6d0655f7703b2e5a681ebc8f3e868a6423))
* remove the signatures option, createLocalSignatureStore, onFormAction and FormAction ([#356](https://github.com/inkbar/inkbar/issues/356)) ([81e28c6](https://github.com/inkbar/inkbar/commit/81e28c66321ed4471485d28eaa449d4700606818))
* set the document's minimum width on the viewer ([#352](https://github.com/inkbar/inkbar/issues/352)) ([db2d724](https://github.com/inkbar/inkbar/commit/db2d724443f5d13b32a3670fbff187bee4693b94))
* style a floating sidebar panel ([#349](https://github.com/inkbar/inkbar/issues/349)) ([8275ac6](https://github.com/inkbar/inkbar/commit/8275ac65349a1848de9c07eccb3b19aa420fb33e))


### Bug Fixes

* close floating sidebar panels when the find bar opens ([#363](https://github.com/inkbar/inkbar/issues/363)) ([0f0e2fb](https://github.com/inkbar/inkbar/commit/0f0e2fbfc440cf87c6029940d24adc24d65de773))
* queue signature saves and only blame a full browser storage when it is ([#357](https://github.com/inkbar/inkbar/issues/357)) ([4f7c24e](https://github.com/inkbar/inkbar/commit/4f7c24eebc1ec8ff782ac27ebc7983db966b36b7))
* tidy floating sidebars and signature storage after review ([#360](https://github.com/inkbar/inkbar/issues/360)) ([e090922](https://github.com/inkbar/inkbar/commit/e090922b46b8f6bcc87698c1b1e60c2ce82f1548))

## [0.12.0](https://github.com/inkbar/inkbar/compare/v0.11.0...v0.12.0) (2026-11-11)


### Features

* add a handbook document to the sandbox ([#328](https://github.com/inkbar/inkbar/issues/328)) ([7f0184a](https://github.com/inkbar/inkbar/commit/7f0184a388d19bee1a4239eef269dc5a915acb09))
* add a resize handle to the vanilla sidebar ([#338](https://github.com/inkbar/inkbar/issues/338)) ([0b52f36](https://github.com/inkbar/inkbar/commit/0b52f3621abc8d526afe324cf8b86cdd2d43e3f2))
* add a storage API for what the viewer keeps between visits ([#334](https://github.com/inkbar/inkbar/issues/334)) ([e00b426](https://github.com/inkbar/inkbar/commit/e00b42619b92640d767f2fb74c302a8c13ee6853))
* add an outline and links scenario to the sandbox ([#329](https://github.com/inkbar/inkbar/issues/329)) ([e7a9cf4](https://github.com/inkbar/inkbar/commit/e7a9cf468f9e767759734e6c16571c0a6592e0ca))
* add InkOutline, InkBack and InkForward to React ([#325](https://github.com/inkbar/inkbar/issues/325)) ([ba1e26f](https://github.com/inkbar/inkbar/commit/ba1e26f3272128849430e2417a09bdad8bf67e70))
* add InkOutline, InkBack and InkForward to Svelte ([#326](https://github.com/inkbar/inkbar/issues/326)) ([bfe1dfa](https://github.com/inkbar/inkbar/commit/bfe1dfa8d7afa4082098ff96ff67ca043b70b6b0))
* add InkOutline, InkBack and InkForward to Vue ([#324](https://github.com/inkbar/inkbar/issues/324)) ([6c987db](https://github.com/inkbar/inkbar/commit/6c987db39fb8279e4c43957bdc35bff50865a59b))
* draw links on the page for keyboard and screen readers ([#321](https://github.com/inkbar/inkbar/issues/321)) ([2d48452](https://github.com/inkbar/inkbar/commit/2d4845228dd3f27d4bdd3765856c9ac4549adf92))
* follow links with a click or tap ([#322](https://github.com/inkbar/inkbar/issues/322)) ([4385c61](https://github.com/inkbar/inkbar/commit/4385c6110b860872f80db9d441edfd4125ce7544))
* give sidebars a width that can be dragged and saved ([#337](https://github.com/inkbar/inkbar/issues/337)) ([2ac1e36](https://github.com/inkbar/inkbar/commit/2ac1e363ff0cdb88df32436861fc5ed34eaa21ec))
* go back and forward through jumps in the document ([#318](https://github.com/inkbar/inkbar/issues/318)) ([372d033](https://github.com/inkbar/inkbar/commit/372d0333760cd679631fbbfd6d94257faa5cc5f9))
* keep sandbox settings between visits ([#343](https://github.com/inkbar/inkbar/issues/343)) ([546f88a](https://github.com/inkbar/inkbar/commit/546f88aa8de1784758c17328857f3c90d45f247e))
* keep signatures in the viewer's storage ([#335](https://github.com/inkbar/inkbar/issues/335)) ([0628d80](https://github.com/inkbar/inkbar/commit/0628d8042ba1ad3b692064deffa9c43546b105b4))
* let plugins keep settings in the viewer's storage ([#336](https://github.com/inkbar/inkbar/issues/336)) ([59b3aaa](https://github.com/inkbar/inkbar/commit/59b3aaaade6820561c0765e4f3f06a3788b8acd4))
* read link annotations into the document ([#320](https://github.com/inkbar/inkbar/issues/320)) ([72b8842](https://github.com/inkbar/inkbar/commit/72b88427ee0d5a197ca188aed165ec1928396543))
* rename onFormAction to onAction ([#319](https://github.com/inkbar/inkbar/issues/319)) ([69d318c](https://github.com/inkbar/inkbar/commit/69d318c80ff0ed7e8766233a1181ca18ab723ed0))
* resize sidebars and pass storage in React ([#340](https://github.com/inkbar/inkbar/issues/340)) ([b8709b3](https://github.com/inkbar/inkbar/commit/b8709b3f66262ffe3efde85900fec3a2287ac738))
* resize sidebars and pass storage in Svelte ([#341](https://github.com/inkbar/inkbar/issues/341)) ([f22772d](https://github.com/inkbar/inkbar/commit/f22772d0f3572414061bd5fcaf1ff38d9f6ee475))
* resize sidebars and pass storage in Vue ([#339](https://github.com/inkbar/inkbar/issues/339)) ([7bb479a](https://github.com/inkbar/inkbar/commit/7bb479a5db3ad06efaddbcce87e29edf64710eb2))
* resolve PDF destinations to a page and position ([#316](https://github.com/inkbar/inkbar/issues/316)) ([9fe6846](https://github.com/inkbar/inkbar/commit/9fe684686a2df33ae37086d1d39886833c4c1577))
* scroll the viewport to a PDF destination ([#317](https://github.com/inkbar/inkbar/issues/317)) ([496e31a](https://github.com/inkbar/inkbar/commit/496e31accd637a9ac7aeede725d85b1ae27dbbbe))
* show the document outline ([#323](https://github.com/inkbar/inkbar/issues/323)) ([78d1440](https://github.com/inkbar/inkbar/commit/78d1440c444633af60af62b4ab0cc6eacf400c1c))


### Bug Fixes

* open a new document at its first page in Svelte ([#332](https://github.com/inkbar/inkbar/issues/332)) ([37d7a54](https://github.com/inkbar/inkbar/commit/37d7a54284a57f3ad2d36ce8d39bbd31bebe86aa))
* tidy links, hover and outline after review ([#330](https://github.com/inkbar/inkbar/issues/330)) ([b92db4f](https://github.com/inkbar/inkbar/commit/b92db4f499b61b4e13aff679280d14688e466339))
* tidy sidebar resizing after review ([#344](https://github.com/inkbar/inkbar/issues/344)) ([8a708fc](https://github.com/inkbar/inkbar/commit/8a708fc3aeed70fbf23c0df4498d519d3a2691f7))

## [0.11.0](https://github.com/inkbar/inkbar/compare/v0.10.0...v0.11.0) (2026-11-09)


### Features

* add a pinchZoom prop to InkViewport ([#302](https://github.com/inkbar/inkbar/issues/302)) ([f5f993e](https://github.com/inkbar/inkbar/commit/f5f993e915c8860fc04537c800c898f02a1a53a7))
* add a press and long press scenario to the sandbox ([#303](https://github.com/inkbar/inkbar/issues/303)) ([a9576ba](https://github.com/inkbar/inkbar/commit/a9576baafa574f1c0f43e89178496c85d504167c))
* detect presses and long presses on pages ([#300](https://github.com/inkbar/inkbar/issues/300)) ([014653f](https://github.com/inkbar/inkbar/commit/014653fda37e5ec30396f6402d1b0821e7b78886))
* ignore finger taps with the drawing tools ([#308](https://github.com/inkbar/inkbar/issues/308)) ([3717cc9](https://github.com/inkbar/inkbar/commit/3717cc9e629508633646fa529cb1b66877dc4a65))
* let a pen take over from a resting palm ([#309](https://github.com/inkbar/inkbar/issues/309)) ([28a8226](https://github.com/inkbar/inkbar/commit/28a822605bec29c7d3b437161fe622cc13354a24))
* let drawing tools take one-finger drags on touch screens ([#307](https://github.com/inkbar/inkbar/issues/307)) ([938a47d](https://github.com/inkbar/inkbar/commit/938a47dc4fb62c91ed911eeac755d37e44cd31c2))
* let plugins listen for presses and long presses ([#301](https://github.com/inkbar/inkbar/issues/301)) ([1c3b950](https://github.com/inkbar/inkbar/commit/1c3b9504bbf655c19688939f3935ba7918160162))
* scroll the document live under a two-finger pan ([#310](https://github.com/inkbar/inkbar/issues/310)) ([897b844](https://github.com/inkbar/inkbar/commit/897b844b7a18d09dac12a0b672672432a06081cb))
* zoom the document on pinch instead of the page ([#298](https://github.com/inkbar/inkbar/issues/298)) ([893f2d4](https://github.com/inkbar/inkbar/commit/893f2d46f219f07ef429fd277e84714fd4298668))
* zoom the document on trackpad pinch ([#299](https://github.com/inkbar/inkbar/issues/299)) ([d933c01](https://github.com/inkbar/inkbar/commit/d933c0119da9c19035f463b29e884004cc63f2e9))


### Bug Fixes

* harden pinch zoom and press reporting ([#304](https://github.com/inkbar/inkbar/issues/304)) ([b51ae31](https://github.com/inkbar/inkbar/commit/b51ae3100fe1bd82c503e9f8380cdf39ceb9eb15))
* keep two-finger scrolling in step with the fingers ([#312](https://github.com/inkbar/inkbar/issues/312)) ([4208e75](https://github.com/inkbar/inkbar/commit/4208e7576f0bd2a4627eeafcf56aefde59445a68))

## [0.10.0](https://github.com/inkbar/inkbar/compare/v0.9.0...v0.10.0) (2026-11-06)


### Features

* add a sidebars scenario to the sandbox ([#290](https://github.com/inkbar/inkbar/issues/290)) ([c0ac6fa](https://github.com/inkbar/inkbar/commit/c0ac6fafc0c4e4819996e8fd2b3ea1da0bdcbb66))
* add record lists and search results to the React bindings ([#286](https://github.com/inkbar/inkbar/issues/286)) ([cbdcb7a](https://github.com/inkbar/inkbar/commit/cbdcb7a361837dfbd3ecfbd07cb47c2fc6ddbcc3))
* add record lists and search results to the Svelte bindings ([#288](https://github.com/inkbar/inkbar/issues/288)) ([ff00d81](https://github.com/inkbar/inkbar/commit/ff00d81e73f14239ad3c5818909d9b14eff8c749))
* add record lists and search results to the Vue bindings ([#284](https://github.com/inkbar/inkbar/issues/284)) ([517f93f](https://github.com/inkbar/inkbar/commit/517f93f1d5a1d9018d7b2fdb24f92b9e27d18f3e))
* add sidebar and thumbnail components to the React bindings ([#285](https://github.com/inkbar/inkbar/issues/285)) ([533239b](https://github.com/inkbar/inkbar/commit/533239b643be9e83c3392f33d2778e51438b6279))
* add sidebar and thumbnail components to the Svelte bindings ([#287](https://github.com/inkbar/inkbar/issues/287)) ([642ed25](https://github.com/inkbar/inkbar/commit/642ed25c44eb18f98170fee8467a4c7c91535035))
* add sidebar and thumbnail components to the Vue bindings ([#283](https://github.com/inkbar/inkbar/issues/283)) ([2dd6125](https://github.com/inkbar/inkbar/commit/2dd61250eb0242ab99820f45be648bf38ae99fbb))
* add sidebars to the redactions and search scenarios ([#289](https://github.com/inkbar/inkbar/issues/289)) ([003afa0](https://github.com/inkbar/inkbar/commit/003afa09cbf901d2553e4dd100fd808908790274))
* add sidebars with rail, tabs and stack layouts ([#279](https://github.com/inkbar/inkbar/issues/279)) ([b5dc359](https://github.com/inkbar/inkbar/commit/b5dc3597e7207f9c3fa8bb27a3af901fbc7446a1))
* download and print the open PDF ([#295](https://github.com/inkbar/inkbar/issues/295)) ([80c9b33](https://github.com/inkbar/inkbar/commit/80c9b33b93d160943b42816d0342f2d5c1163b40))
* list page thumbnails that follow the current page ([#281](https://github.com/inkbar/inkbar/issues/281)) ([2c45a9f](https://github.com/inkbar/inkbar/commit/2c45a9f37ebfeb2ec36776b32a42dd80b7a20cdc))
* list plugin records and search results as cards ([#282](https://github.com/inkbar/inkbar/issues/282)) ([1519794](https://github.com/inkbar/inkbar/commit/1519794ace1e06cc1d71c452f77ded6004bd5f56))
* polish sidebars, thumbnails and search, and hide sidebars on demand ([#293](https://github.com/inkbar/inkbar/issues/293)) ([66d14fd](https://github.com/inkbar/inkbar/commit/66d14fd2562c03ae588dca080a453eef7b610ffd))
* read and write plugin records from the host ([#276](https://github.com/inkbar/inkbar/issues/276)) ([f8dbf35](https://github.com/inkbar/inkbar/commit/f8dbf35828d6ed8cf15152ed5d3eab3afb6e77f0))
* render a page thumbnail with its live annotations ([#280](https://github.com/inkbar/inkbar/issues/280)) ([4a63e91](https://github.com/inkbar/inkbar/commit/4a63e9124e3af6a56c026fa865a2c8cb4bb7c741))
* select a search hit by index and show excerpts on cards ([#278](https://github.com/inkbar/inkbar/issues/278)) ([9355d8f](https://github.com/inkbar/inkbar/commit/9355d8fb27406c6509335bf5a02d085e440443a1))
* share each marks call's card and a selection per records store ([#277](https://github.com/inkbar/inkbar/issues/277)) ([f9a829b](https://github.com/inkbar/inkbar/commit/f9a829b6d0b0de0cfe87ec10bf24bdce7c0d365c))


### Bug Fixes

* draw the icon of an embedded note that has no appearance of its own ([#296](https://github.com/inkbar/inkbar/issues/296)) ([0b86b6a](https://github.com/inkbar/inkbar/commit/0b86b6a7fcdbb289394502c76dbcce1c0c12b483))
* **theme:** fill the note's box with its icon ([#297](https://github.com/inkbar/inkbar/issues/297)) ([5e7daee](https://github.com/inkbar/inkbar/commit/5e7daee009421a8296d4e5ba204dab1b73ebf051))
* tidy sidebars, thumbnails and record lists after review ([#291](https://github.com/inkbar/inkbar/issues/291)) ([db74eef](https://github.com/inkbar/inkbar/commit/db74eef0c9835c3f28eed6e5138e4c8ded12ca71))

## [0.9.0](https://github.com/inkbar/inkbar/compare/v0.8.0...v0.9.0) (2026-11-05)


### Features

* add InkToolbarButton for your own toolbar buttons ([#271](https://github.com/inkbar/inkbar/issues/271)) ([e86b29a](https://github.com/inkbar/inkbar/commit/e86b29ae63c5452278a5076ee5f64dda8e82aa6d))
* add the form scenario and its values panel ([#264](https://github.com/inkbar/inkbar/issues/264)) ([a8850dd](https://github.com/inkbar/inkbar/commit/a8850dd09883139a9416b34a5d40c3ef09c960f4))
* add the redaction and long document scenarios ([#265](https://github.com/inkbar/inkbar/issues/265)) ([4427030](https://github.com/inkbar/inkbar/commit/4427030fb4566cba6a09a8348feac23c01964ce9))
* add the sandbox scenario registry and routes ([#261](https://github.com/inkbar/inkbar/issues/261)) ([5dfdc24](https://github.com/inkbar/inkbar/commit/5dfdc24be7c92f0df5b1948bfe34ce9e6b47a019))
* add the scenario shell to the sandbox ([#262](https://github.com/inkbar/inkbar/issues/262)) ([0afd6b2](https://github.com/inkbar/inkbar/commit/0afd6b2c0ae1289ac9a6e4cc722c0c210cba1edb))
* add the tools and controlled annotation scenarios ([#263](https://github.com/inkbar/inkbar/issues/263)) ([39b6a25](https://github.com/inkbar/inkbar/commit/39b6a251af965a5e1f77aa9e7821c9a9871805d3))
* generate a document per sandbox scenario ([#260](https://github.com/inkbar/inkbar/issues/260)) ([18c2476](https://github.com/inkbar/inkbar/commit/18c2476d64ef7273abe0275d31878ba6aecd823d))
* guide each annotation tour feature with its toolbar buttons and steps ([#274](https://github.com/inkbar/inkbar/issues/274)) ([c9870b0](https://github.com/inkbar/inkbar/commit/c9870b0f1cdae4227b8173d6f2a531d2a338e6fe))
* hide tool buttons and menus for a missing tool ([#253](https://github.com/inkbar/inkbar/issues/253)) ([39a9756](https://github.com/inkbar/inkbar/commit/39a97561f416bc226ee8304ccb8b0a0a00d13fe1))
* let createViewer take a controlled annotation list ([#267](https://github.com/inkbar/inkbar/issues/267)) ([d1f89f0](https://github.com/inkbar/inkbar/commit/d1f89f0fcad5bc6d7dc0f5fa9c65ac764404272d))
* log UnknownTool for a tool id nobody registered ([#251](https://github.com/inkbar/inkbar/issues/251)) ([fe5cc83](https://github.com/inkbar/inkbar/commit/fe5cc832385483fc5decdbb8ee764705db4c65d9))
* make creation tools opt-in and add allTools ([#252](https://github.com/inkbar/inkbar/issues/252)) ([4e2ddec](https://github.com/inkbar/inkbar/commit/4e2ddec450331faedde772e0769c874ad8edb853))
* make the scenario shell the sandbox home ([#266](https://github.com/inkbar/inkbar/issues/266)) ([f212ae7](https://github.com/inkbar/inkbar/commit/f212ae75776482f127b03eb9a70a9e2db93411af))
* open a PDF from each sandbox scenario's toolbar ([#272](https://github.com/inkbar/inkbar/issues/272)) ([9762be0](https://github.com/inkbar/inkbar/commit/9762be078eca7df7697ba52a2e09b0d055960a97))
* pass creation tools explicitly in the React binding ([#255](https://github.com/inkbar/inkbar/issues/255)) ([6ba1b3a](https://github.com/inkbar/inkbar/commit/6ba1b3a1bb4d603f62eb5fc395cbce2babe068ac))
* pass creation tools explicitly in the Svelte binding ([#256](https://github.com/inkbar/inkbar/issues/256)) ([6cfedab](https://github.com/inkbar/inkbar/commit/6cfedaba2c8a1bc784a929ab1a790a5bbe4b3bc4))
* pass creation tools explicitly in the Vue binding ([#254](https://github.com/inkbar/inkbar/issues/254)) ([c61226c](https://github.com/inkbar/inkbar/commit/c61226c2cea536e6229d8cc46aa7b0e417d666e1))
* pick the sandbox framework from a menu ([#273](https://github.com/inkbar/inkbar/issues/273)) ([c6ef12a](https://github.com/inkbar/inkbar/commit/c6ef12ad9cfc2f6fc27ac20eec5af8dd5fa1bc17))
* put the sandbox view tabs and file controls on one strip ([#270](https://github.com/inkbar/inkbar/issues/270)) ([eb1a7d8](https://github.com/inkbar/inkbar/commit/eb1a7d8de2076b6e29157beb68d7d026de58186f))


### Bug Fixes

* lock down missing tool buttons and tidy the docs ([#258](https://github.com/inkbar/inkbar/issues/258)) ([fca453f](https://github.com/inkbar/inkbar/commit/fca453f814e22748c7c6c404d26b7fa8e1302322))
* release the svelte signature dialog's pointer lock on close ([#268](https://github.com/inkbar/inkbar/issues/268)) ([daea09f](https://github.com/inkbar/inkbar/commit/daea09f7ef0ebfc9b76603fdca5482deff22f425))
* use fictional addresses and log form field changes ([#269](https://github.com/inkbar/inkbar/issues/269)) ([50ee78d](https://github.com/inkbar/inkbar/commit/50ee78dab707c8c7a9ebf251cc2dea5045ef7946))

## [0.8.0](https://github.com/inkbar/inkbar/compare/v0.7.0...v0.8.0) (2026-10-23)


### Features

* add a form tour to the sandbox ([#219](https://github.com/inkbar/inkbar/issues/219)) ([ac0640f](https://github.com/inkbar/inkbar/commit/ac0640fffaf5e8fe408f95bd77010da197485022))
* fill checkboxes, radios and choice fields ([#214](https://github.com/inkbar/inkbar/issues/214)) ([5ddfd60](https://github.com/inkbar/inkbar/commit/5ddfd60c05c781774c7d941f6c02fcc93303c2af))
* fill forms in the react binding ([#217](https://github.com/inkbar/inkbar/issues/217)) ([14d3da8](https://github.com/inkbar/inkbar/commit/14d3da81f7c71aa00ec94a53bf085564280a260e))
* fill forms in the svelte binding ([#218](https://github.com/inkbar/inkbar/issues/218)) ([2614f32](https://github.com/inkbar/inkbar/commit/2614f3296c52bfcaa56f4d1d71dc87681af4a5d7))
* fill forms in the vue binding ([#216](https://github.com/inkbar/inkbar/issues/216)) ([54fa07e](https://github.com/inkbar/inkbar/commit/54fa07e5ec6887b61187112e12fa963b62e8db65))
* fill text fields on the page ([#213](https://github.com/inkbar/inkbar/issues/213)) ([6dd472c](https://github.com/inkbar/inkbar/commit/6dd472cd8a2af7e9ac23fac01f4e9d918e3d9df9))
* keep form field values on the document ([#211](https://github.com/inkbar/inkbar/issues/211)) ([881fbf8](https://github.com/inkbar/inkbar/commit/881fbf83ffa61c487f172524fabcf52024a9a0f8))
* read form fields from a pdf ([#210](https://github.com/inkbar/inkbar/issues/210)) ([a871a21](https://github.com/inkbar/inkbar/commit/a871a215bd2515beae1f82d07872f2d000b58349))
* run form scripts in an isolated sandbox ([#212](https://github.com/inkbar/inkbar/issues/212)) ([c162b52](https://github.com/inkbar/inkbar/commit/c162b52b991fd3e08f4d4edfbcf9907c5513e95b))
* sign signature fields and report form actions ([#215](https://github.com/inkbar/inkbar/issues/215)) ([876d2b5](https://github.com/inkbar/inkbar/commit/876d2b541cf52569c4da85d6c3b563d0b0162e7c))
* undo and redo from the keyboard ([#241](https://github.com/inkbar/inkbar/issues/241)) ([91baedc](https://github.com/inkbar/inkbar/commit/91baedcb1f40d8c14e962cc46ec4c34c407fdbed))


### Bug Fixes

* keep form script writes off the undo stack ([#237](https://github.com/inkbar/inkbar/issues/237)) ([352b78f](https://github.com/inkbar/inkbar/commit/352b78f833b9251f75ed23bbf5e6f2c509d628f7))
* tighten form field controls ([#239](https://github.com/inkbar/inkbar/issues/239)) ([f64c7d9](https://github.com/inkbar/inkbar/commit/f64c7d93d9291ef77dfb9d55305230b5f11a60e9))
* tighten form filling after review ([#220](https://github.com/inkbar/inkbar/issues/220)) ([e36e67c](https://github.com/inkbar/inkbar/commit/e36e67c7a7d400a4c0c7e2afacea6e244f1c816b))
* tighten form handling in the bindings ([#240](https://github.com/inkbar/inkbar/issues/240)) ([e5fd48c](https://github.com/inkbar/inkbar/commit/e5fd48cbbd20a510cf988c66f0f35a2298172c04))
* tighten the form model and reader ([#238](https://github.com/inkbar/inkbar/issues/238)) ([b8efcb1](https://github.com/inkbar/inkbar/commit/b8efcb1fca801afd332eaf507f0d5b0b81476f97))


### Performance

* render each form page once ([#236](https://github.com/inkbar/inkbar/issues/236)) ([6424d0a](https://github.com/inkbar/inkbar/commit/6424d0a8301877c7949078b89f17894af7a36110))

## [0.7.0](https://github.com/inkbar/inkbar/compare/v0.6.0...v0.7.0) (2026-10-23)


### Features

* add a find bar and search button ([#226](https://github.com/inkbar/inkbar/issues/226)) ([7c825ef](https://github.com/inkbar/inkbar/commit/7c825ef053a0fb550374356263ddd6af749b8cb0))
* add a find bar to the React binding ([#228](https://github.com/inkbar/inkbar/issues/228)) ([59a75d0](https://github.com/inkbar/inkbar/commit/59a75d022b1980df41ca2d09976b2538cd259977))
* add a find bar to the Svelte binding ([#229](https://github.com/inkbar/inkbar/issues/229)) ([bd56c12](https://github.com/inkbar/inkbar/commit/bd56c1263db09da575df6ecce1e4e683409bc86c))
* add a find bar to the Vue binding ([#227](https://github.com/inkbar/inkbar/issues/227)) ([5efad17](https://github.com/inkbar/inkbar/commit/5efad17a24c01c263e34190459a83e2127a3e6b5))
* add a viewer search controller ([#224](https://github.com/inkbar/inkbar/issues/224)) ([6bd1bc5](https://github.com/inkbar/inkbar/commit/6bd1bc5f12623f3e4b5546bc54a43f4034374933))
* highlight search matches on the page ([#225](https://github.com/inkbar/inkbar/issues/225)) ([3eff72b](https://github.com/inkbar/inkbar/commit/3eff72b36943c9b8d82eeb9e09b037e711c892d8))
* say whether a search hit's boxes are exact ([#243](https://github.com/inkbar/inkbar/issues/243)) ([005fbd7](https://github.com/inkbar/inkbar/commit/005fbd74acfd0793c1f9b2392dc2e870b3d4a339))
* search a document's text ([#223](https://github.com/inkbar/inkbar/issues/223)) ([a252882](https://github.com/inkbar/inkbar/commit/a252882ed7aa0ddd249dbf5a16db6bf82445b80c))


### Bug Fixes

* cut search hit boxes at the PDF font's glyph widths ([#242](https://github.com/inkbar/inkbar/issues/242)) ([0b501fb](https://github.com/inkbar/inkbar/commit/0b501fb491e18d7c985b30665dd71688c0a061a4))
* draw search matches under the text in the brand highlighter ([#235](https://github.com/inkbar/inkbar/issues/235)) ([50a9cbe](https://github.com/inkbar/inkbar/commit/50a9cbe576c52f399a413054def9d80f82bd1cd2))
* harden search against zero-length matches, long documents and blank queries ([#231](https://github.com/inkbar/inkbar/issues/231)) ([0adc4b3](https://github.com/inkbar/inkbar/commit/0adc4b375e3b3fe97971b54a3825e484ca910247))
* join page text the way the page reads ([#222](https://github.com/inkbar/inkbar/issues/222)) ([2a8d685](https://github.com/inkbar/inkbar/commit/2a8d685ae760c524642ce8b7de9178228094196e))
* land the first find step on the first match ([#245](https://github.com/inkbar/inkbar/issues/245)) ([dd9b86f](https://github.com/inkbar/inkbar/commit/dd9b86faf8fda55528beb6b00b8e58d3ccd083ea))
* place search highlights by measured glyph widths ([#234](https://github.com/inkbar/inkbar/issues/234)) ([b8bd2d4](https://github.com/inkbar/inkbar/commit/b8bd2d4b56487eb92708e719905c173e0bb4689d))
* read glyph positions only for pages with search hits ([#247](https://github.com/inkbar/inkbar/issues/247)) ([8e70e68](https://github.com/inkbar/inkbar/commit/8e70e6805c1eaeedefc83fc9ba32040f236ceb8e))
* space right-to-left words in search text ([#246](https://github.com/inkbar/inkbar/issues/246)) ([3ab133e](https://github.com/inkbar/inkbar/commit/3ab133e407b7a8dd182c81a865c1a7ee28a8a466))
* tidy search edge cases across core and the bindings ([#233](https://github.com/inkbar/inkbar/issues/233)) ([785db9e](https://github.com/inkbar/inkbar/commit/785db9e8648701a46a99ca9d26fa9189f61257ef))

## [0.6.0](https://github.com/inkbar/inkbar/compare/v0.5.0...v0.6.0) (2026-10-22)


### Features

* accept plugins in createViewer and add command buttons ([#179](https://github.com/inkbar/inkbar/issues/179)) ([bbb661d](https://github.com/inkbar/inkbar/commit/bbb661d900694167c9be8b468e1c51b30932abcb))
* add a plugin host with commands, tools, decorations and record stores ([#177](https://github.com/inkbar/inkbar/issues/177)) ([60c34ee](https://github.com/inkbar/inkbar/commit/60c34ee27556d73f34b6965f1e0e45d6f712a2c2))
* add cards for plugin marks, styled by the theme ([#202](https://github.com/inkbar/inkbar/issues/202)) ([4145110](https://github.com/inkbar/inkbar/commit/414511049c23a2c037806c7772ffcdd4cbf10389))
* add definePlugin(id, setup) with records that follow the open document ([#198](https://github.com/inkbar/inkbar/issues/198)) ([3a400d0](https://github.com/inkbar/inkbar/commit/3a400d0cdbb90683b5bf57dc836bf4121f30f670))
* add plugin.command with status, cancellation and errors ([#199](https://github.com/inkbar/inkbar/issues/199)) ([baf87cb](https://github.com/inkbar/inkbar/commit/baf87cb6d59ba341492e55044c256576384556fe))
* add plugin.marks for drawing records on the page ([#201](https://github.com/inkbar/inkbar/issues/201)) ([3f28ace](https://github.com/inkbar/inkbar/commit/3f28ace999270680c4ba810f4e334f40fb13225f))
* add quad, rect and page text helpers ([#197](https://github.com/inkbar/inkbar/issues/197)) ([33804b0](https://github.com/inkbar/inkbar/commit/33804b010b21adce4d4355dfc8e075d1dae41558))
* add record stores and an annotation edit event ([#174](https://github.com/inkbar/inkbar/issues/174)) ([a6a1dcd](https://github.com/inkbar/inkbar/commit/a6a1dcda1cdeb68b3e29d4a44b84c2f209ebb141))
* include record stores in controlled undo ([#176](https://github.com/inkbar/inkbar/issues/176)) ([24e7313](https://github.com/inkbar/inkbar/commit/24e7313c2324e548240c7eda47734d140c658788))
* let history track record stores and react to annotation edits ([#175](https://github.com/inkbar/inkbar/issues/175)) ([30a6ae8](https://github.com/inkbar/inkbar/commit/30a6ae8177ef8deef3ee315142ed4fdf0a6d3625))
* let plugins draw their own layer on each page ([#178](https://github.com/inkbar/inkbar/issues/178)) ([08810c6](https://github.com/inkbar/inkbar/commit/08810c6635e7ad28bd3a09018007dc0ad256a119))
* let plugins redecorate annotations ([#190](https://github.com/inkbar/inkbar/issues/190)) ([da6c9a4](https://github.com/inkbar/inkbar/commit/da6c9a40493492284c472dac6f7fe1b5476d1e9f))
* link plugin records to the annotations they create ([#200](https://github.com/inkbar/inkbar/issues/200)) ([167ba1d](https://github.com/inkbar/inkbar/commit/167ba1dd3b0bd303d09ed0a472a198d92d31f1e8))
* **react:** add plugins, InkCommand and useCommand ([#181](https://github.com/inkbar/inkbar/issues/181)) ([ce57d02](https://github.com/inkbar/inkbar/commit/ce57d02fde92988410df3ef94cc4e4efaa7d00ac))
* rebuild the sandbox suggestions as a plugin ([#183](https://github.com/inkbar/inkbar/issues/183)) ([6487795](https://github.com/inkbar/inkbar/commit/6487795834463d06cb76143da14314345fe53157))
* rewrite the sandbox plugin on the fluent plugin API ([#203](https://github.com/inkbar/inkbar/issues/203)) ([56dcfe7](https://github.com/inkbar/inkbar/commit/56dcfe716118a242a8761d11c50662c294d73774))
* scroll to new plugin marks with scrollToFirst ([#206](https://github.com/inkbar/inkbar/issues/206)) ([9a87595](https://github.com/inkbar/inkbar/commit/9a8759567a033d9a426d04c6c7ed1beae8bd28b3))
* show the example plugin on every sandbox page and add a plugin page ([#184](https://github.com/inkbar/inkbar/issues/184)) ([ec93815](https://github.com/inkbar/inkbar/commit/ec938152ad859af3cb6bfecd61b6cb84068779ca))
* **svelte:** add plugins, InkCommand and useCommand ([#182](https://github.com/inkbar/inkbar/issues/182)) ([f42ecc2](https://github.com/inkbar/inkbar/commit/f42ecc2a889bfa6b4dc3c8a1628fe0e8d9e584c6))
* tell sandbox visitors they can extend Inkbar with plugins ([#196](https://github.com/inkbar/inkbar/issues/196)) ([c29b7fc](https://github.com/inkbar/inkbar/commit/c29b7fce86a48667335572e6d9572dbe545c5b96))
* **vue:** add plugins, InkCommand and useCommand ([#180](https://github.com/inkbar/inkbar/issues/180)) ([3f5fd74](https://github.com/inkbar/inkbar/commit/3f5fd7486fbeaa6f4eb63e6263382060e2948ecf))


### Bug Fixes

* clean up plugins when a later setup throws ([#188](https://github.com/inkbar/inkbar/issues/188)) ([45c5ecd](https://github.com/inkbar/inkbar/commit/45c5ecd0bd977eba2dc94d77a58c9851b2f6c248))
* keep annotation undo when a plugin resets its records ([#187](https://github.com/inkbar/inkbar/issues/187)) ([653f4cb](https://github.com/inkbar/inkbar/commit/653f4cbfb6771dceac3829e1fb07c7f4b4de8094))
* keep class-based plugin tools working ([#189](https://github.com/inkbar/inkbar/issues/189)) ([c241fa6](https://github.com/inkbar/inkbar/commit/c241fa68c2657092d51a9cbbeb06050d02cbcd71))
* keep focus on a command button while its command runs ([#207](https://github.com/inkbar/inkbar/issues/207)) ([9a9e545](https://github.com/inkbar/inkbar/commit/9a9e545e83bdac42e2f5a399164026854836bf05))
* keep keyboard focus where it moved when a Svelte menu refocuses on open ([#208](https://github.com/inkbar/inkbar/issues/208)) ([61b2fdc](https://github.com/inkbar/inkbar/commit/61b2fdc512dc5c1b8a992d75175d1fe11d0809b6))
* let plugin marks take presses without the theme ([#191](https://github.com/inkbar/inkbar/issues/191)) ([d5b8c40](https://github.com/inkbar/inkbar/commit/d5b8c40a72613343ed91e85ffde90ce12704dc07))
* log unknown plugin commands instead of throwing ([#195](https://github.com/inkbar/inkbar/issues/195)) ([33aef97](https://github.com/inkbar/inkbar/commit/33aef97a5c044097f5412fdec096a112fccf8686))
* run plugin setup only in the browser ([#192](https://github.com/inkbar/inkbar/issues/192)) ([7b2540d](https://github.com/inkbar/inkbar/commit/7b2540d7e929d86e79d765133831aa52b959949a))

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
