# Changelog

## [1.3.0](https://github.com/governify-next/join-backend/compare/v1.2.0...v1.3.0) (2026-09-29)


### Features

* add @oas-tools/oas-telemetry for enhanced telemetry support ([69ad132](https://github.com/governify-next/join-backend/commit/69ad132a2ef25ac3e5ef1b1d5ffa74e445f9a6ed))
* add legacy support for Bluejay compatibility ([efbcb27](https://github.com/governify-next/join-backend/commit/efbcb273c9c0ad85bcac16ba671719bd3bd18736))
* add state synchronization scheduling for Reporter every 20 minutes ([a62868f](https://github.com/governify-next/join-backend/commit/a62868fd3692eb8d474269300702c705e78e670d))
* configure repository onboarding restriction flag ([1093689](https://github.com/governify-next/join-backend/commit/1093689fb318c3cb27af55598a5df3b996a8f6c3))
* enforce optional repository onboarding uniqueness ([0f82406](https://github.com/governify-next/join-backend/commit/0f8240667108bcf9be9c3282b1e82c29fb737596))
* implement evolutive scheduling for provisioning ([5b4fde7](https://github.com/governify-next/join-backend/commit/5b4fde7767ad28cb17baad610eb856f32e970c79))
* new version ([f7c4b26](https://github.com/governify-next/join-backend/commit/f7c4b26e8cbdbb4d975b25d3694c186eeb7d64ce))


### Bug Fixes

* update onboarding definitions with tpa-UCLM-ISII-2026-2027-v1-0-0 ([0420655](https://github.com/governify-next/join-backend/commit/04206550211994008b98c9db1a9c25a51c0885fd))
* update OTEL_SERVICE_NAME to match the project name ([f2ec3a3](https://github.com/governify-next/join-backend/commit/f2ec3a3db494a5564d81e0bbd3912e16193f8db2))

## [1.2.0](https://github.com/governify-next/join-backend/compare/v1.1.0...v1.2.0) (2026-09-19)


### Features

* enhance logger with color output and refactor log level handling ([8391d91](https://github.com/governify-next/join-backend/commit/8391d9131d444d792d7e7bc32ed3b0b3a3ad57f9))
* pass GitHub installation IDs to fetcher ([8cb28ca](https://github.com/governify-next/join-backend/commit/8cb28ca43982932804d993f8b66aafb8d3bed9d6))


### Bug Fixes

* new version ([c7e4291](https://github.com/governify-next/join-backend/commit/c7e429165d96b3ab852fec2f82de9bb1ef2c7b5b))
* update package log with lost config ([7a11719](https://github.com/governify-next/join-backend/commit/7a11719323b31b02d81a7547623522b3199bf0c9))

## 1.1.0 (2026-09-14)

### Features

- add visualization configuration for signatures ([58d0eef](https://github.com/governify-next/join-backend/commit/58d0eef3f3181d6908e40cfdd0bd3cee0c816a3c))
- implement modular agreement onboarding ([4be4f3e](https://github.com/governify-next/join-backend/commit/4be4f3e06dfa9bc84a381cda188d8ea2c9670983))
- **onboarding:** add configurable join links and member details ([f582856](https://github.com/governify-next/join-backend/commit/f582856a02d97e2e24a3287c4d5e02e00a94c7be))
- **onboarding:** create dashboard after provisioning ([355349e](https://github.com/governify-next/join-backend/commit/355349ee1b2b333412b11e3416817a73f3874a58))
- **onboarding:** filter result outputs by join link ([dfada0d](https://github.com/governify-next/join-backend/commit/dfada0d7f0b8f317c0ff407b414bd50fb776572d))
- **onboarding:** list and delete owned sessions ([589f089](https://github.com/governify-next/join-backend/commit/589f089997d92c7f78815efa4471878562d413e4))
- **onboarding:** provision registry-backed scoped agreements ([fb4c025](https://github.com/governify-next/join-backend/commit/fb4c025e6df314ac8b335b1177ed70358cfde4ae))
- **onboarding:** support repository-derived scope names ([ff01757](https://github.com/governify-next/join-backend/commit/ff017573bb038494981930f9c9685a730f34a975))
- **onboarding:** support UCLM agreement template ([beb3df7](https://github.com/governify-next/join-backend/commit/beb3df7874a9f2de1a4eff8df55fccaf0a99181a))
- prototype (WIP) ([c1d443f](https://github.com/governify-next/join-backend/commit/c1d443fd098607f8f171a02c28dd490dfb415ee4))

### Bug Fixes

- **copy:** clarify scope and agreement name ([169ea54](https://github.com/governify-next/join-backend/commit/169ea5412f478b59237a56c52e7df6dd92448f18))
- fetch service token from authenticator ([82c7b0f](https://github.com/governify-next/join-backend/commit/82c7b0f90da02203d0159cf057b2cbc461f15dbd))
- log github callback failures ([bd86d37](https://github.com/governify-next/join-backend/commit/bd86d37b1fec0dbf693a297afd64633344cfd9fa))
- **onboarding:** allow incomplete draft answers ([75df881](https://github.com/governify-next/join-backend/commit/75df881893d1dd770cafa8e29206f9cd3d58a666))
- **onboarding:** name agCols by default as the scope name ([26b2ffb](https://github.com/governify-next/join-backend/commit/26b2ffb6684043db77ac27f4baeb9b67a2c77b2e))
- **onboarding:** publish repository scope trees ([7ab190f](https://github.com/governify-next/join-backend/commit/7ab190f1e7874a707065b25178a5ddbfd17467be))
- **onboarding:** publish repository scope trees ([c0a66ce](https://github.com/governify-next/join-backend/commit/c0a66ce65e98213be656e0d5ef0cead9be3907b7))
- **onboarding:** remove workaround for registry bug ([b890332](https://github.com/governify-next/join-backend/commit/b890332c00b1c20e4996c20dc7e27d3dfba50898))
- **onboarding:** require a join link for creation ([6d527bd](https://github.com/governify-next/join-backend/commit/6d527bd764c22d265586cc7ebdda0b19df38492d))
- remove unused installationId ([46ebe0f](https://github.com/governify-next/join-backend/commit/46ebe0f9b9b970bf6984143d0985f8018d068739))
- retry transient github failures ([05f532b](https://github.com/governify-next/join-backend/commit/05f532bac49aee5225c2480423bdbe4b451ef552))
- reuse existing GitHub App installations ([d5f0992](https://github.com/governify-next/join-backend/commit/d5f0992ff017145a30cdd8e9b9b4217a6303498b))
- **scopes:** publish member identity emails ([e71e8b1](https://github.com/governify-next/join-backend/commit/e71e8b1dcd5005587fefda1ca3c7ea6d5dc65c6f))
- **scopes:** publish structured onboarding trees ([0140672](https://github.com/governify-next/join-backend/commit/0140672e0348c20bbc58c4266db87f46ff4986bc))
- support legacy organization lookup ([b9dec0f](https://github.com/governify-next/join-backend/commit/b9dec0f65e558a7cdb79fec32376544ec8178655))
- use port 5907 for standalone deployments ([2577c8c](https://github.com/governify-next/join-backend/commit/2577c8cd83a021731c25ad014fab8c6f0a26e17f))
- use service headers for internal requests ([d3f127f](https://github.com/governify-next/join-backend/commit/d3f127f487b011f8298b8ea1b3b675b59cbfebd9))

### Miscellaneous Chores

- prepare v1.1.0 release ([d2f9c1d](https://github.com/governify-next/join-backend/commit/d2f9c1d9daefa1680d23833f001fd3a3753aace2))
- release 1.1.0 ([dcdcd59](https://github.com/governify-next/join-backend/commit/dcdcd5921c9174c906a1e4d0121cb958a9419bb0))
