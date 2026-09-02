## [1.0.6](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.5...v1.0.6) (2026-09-02)

## [1.0.5](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.4...v1.0.5) (2026-09-02)

## [1.0.4](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.3...v1.0.4) (2026-09-02)


### Bug Fixes

* **auth:** hand APP_URL to Auth.js without validating the environment at import ([fa357ad](https://github.com/jonathansantilli/codegate-guardian/commit/fa357adce80d622abb0edef5c93f04052d28d49f))
* make the published image deployable, and stop it lying about itself ([2db2c4a](https://github.com/jonathansantilli/codegate-guardian/commit/2db2c4aaedb0a8dcf141e2683f790236324d07ad))

## [1.0.3](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.2...v1.0.3) (2026-09-01)


### Bug Fixes

* **fleet:** accept artifact content by format, not by risk surface alone ([9d32508](https://github.com/jonathansantilli/codegate-guardian/commit/9d3250868782c4a2e25310f9016c84fe8eb2a79b))

## [1.0.2](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.1...v1.0.2) (2026-09-01)


### Bug Fixes

* **fleet:** describe a finding from its latest report, not its first ([9162f99](https://github.com/jonathansantilli/codegate-guardian/commit/9162f99355454e795c06f0191244776b97be47a8))

## [1.0.1](https://github.com/jonathansantilli/codegate-guardian/compare/v1.0.0...v1.0.1) (2026-08-31)

# 1.0.0 (2026-08-31)


### Bug Fixes

* **auth:** close the doors the last fix left beside the ones it shut ([f40335a](https://github.com/jonathansantilli/codegate-guardian/commit/f40335a034c1a393512a7d72510f8364cf7e16d5))
* **auth:** stop handing a session to anyone who can reach the port ([4484e6c](https://github.com/jonathansantilli/codegate-guardian/commit/4484e6cacd0f3926606d97cea40fab5bbbbfd070))
* close the security items the reviews left open ([1fc102f](https://github.com/jonathansantilli/codegate-guardian/commit/1fc102faaf049aae5ce9a39bf8325fa5cda36afd))
* close what the fifth review proved ([c7e6265](https://github.com/jonathansantilli/codegate-guardian/commit/c7e6265eb0b01cadcb54df8aced251de11e83bd7))
* **compose:** let the Postgres host port be moved ([b387a0c](https://github.com/jonathansantilli/codegate-guardian/commit/b387a0c353e1c105ce9f9a660cd4a5ade62d8ec8))
* **compose:** publish nothing to the network by default ([e27e8f2](https://github.com/jonathansantilli/codegate-guardian/commit/e27e8f27c53c85b83ead7435c3065ae75b09245d))
* **compose:** stop colliding with other stacks on this machine ([5a34d75](https://github.com/jonathansantilli/codegate-guardian/commit/5a34d759ee3b51075d1330a79e4f934ecfca153f))
* **console:** count what a machine carries, not what the agent probed ([0b92cee](https://github.com/jonathansantilli/codegate-guardian/commit/0b92cee152121d2b11f59465a370c6ef69174d9c))
* **console:** make search answer, and stop drawing a box inside a box ([eb95f3e](https://github.com/jonathansantilli/codegate-guardian/commit/eb95f3e1b11a92ace419afc77e447b1f13a39643))
* **db:** rebuild the schema, starting with timestamps that were wrong ([942d856](https://github.com/jonathansantilli/codegate-guardian/commit/942d856ebb4015fe8fe41310fc972dcd4e0485ca))
* **deps:** pin the remaining advisories out of the build toolchain ([4cdbeaf](https://github.com/jonathansantilli/codegate-guardian/commit/4cdbeafa9b91ff0e81ea2c93141d16523b9f6b64))
* **deps:** take the security updates Dependabot was not enabled to report ([527b4e8](https://github.com/jonathansantilli/codegate-guardian/commit/527b4e833e721b2de8446ae09e05bb1642ac0260))
* **fleet:** an unbound machine is a slot, and a slot needs opening ([a3006b1](https://github.com/jonathansantilli/codegate-guardian/commit/a3006b11a199271b0403cc29ba2e180f4b9c2a32))
* **fleet:** correct the numbers the console leads with ([1d312bf](https://github.com/jonathansantilli/codegate-guardian/commit/1d312bf214b3e4f063850de3b38c4a71ed9076a9))
* **fleet:** count distinct machines per artifact, not variant sums ([196919e](https://github.com/jonathansantilli/codegate-guardian/commit/196919e95bc8bb6e04fbc120291a59a7208dd116))
* **fleet:** undo the regressions the last round introduced ([db59bd1](https://github.com/jonathansantilli/codegate-guardian/commit/db59bd17b5cad9d61ee9be6bfcdb021eef5fc65e))
* **ingest:** a machine reports as itself, not as whoever it claims to be ([f55c2df](https://github.com/jonathansantilli/codegate-guardian/commit/f55c2df5b63f3199d3521e111fd5712e7baa24fd))
* **ingest:** losing an enrolment race is a refusal, not a takeover ([6afb9ea](https://github.com/jonathansantilli/codegate-guardian/commit/6afb9eab1d693a5345ae80d595ee9ca4e7be7cb8))
* make the repository true before it is public ([35877b6](https://github.com/jonathansantilli/codegate-guardian/commit/35877b633ae9dc74a8d83c3dd4fde4934544d8be))
* set writable codegate home in serverless runtime ([3c0a654](https://github.com/jonathansantilli/codegate-guardian/commit/3c0a6548d7bba29adbaf8f4fa5a28df2d906ded3))
* **uploads:** serve stored objects without an auth redirect ([af9dce5](https://github.com/jonathansantilli/codegate-guardian/commit/af9dce5d9379552e20e5d5ad894ede356d1c0c85))
* what two adversarial reviews proved, and one claim they disproved ([1655495](https://github.com/jonathansantilli/codegate-guardian/commit/16554957e97a1b0f316cec1c055f6d5fa8c98942))


### Features

* add github repo scan tool to chat flow ([4cbff43](https://github.com/jonathansantilli/codegate-guardian/commit/4cbff436a2622341e78a3edb56e7e7a27dfc3bad))
* add hackathon mode for global reporting ([695deb2](https://github.com/jonathansantilli/codegate-guardian/commit/695deb2faed49f89825918d196de33df1b09fa7b))
* add interactive skills scan flow for github repos ([3df1c90](https://github.com/jonathansantilli/codegate-guardian/commit/3df1c9051fed13fb59c9411ea2dfffb39fb81050))
* add local CLI model adapters (Claude Code, Codex) ([31885e2](https://github.com/jonathansantilli/codegate-guardian/commit/31885e2c842dfc9514c4fa84a2346a3c1ee55db7))
* bootstrap codegate guardian baseline ([b939a93](https://github.com/jonathansantilli/codegate-guardian/commit/b939a9375817517a06c4bcf008937a0e556a7f70))
* close the bootstrap window, and test the bundle the image ships ([a72782b](https://github.com/jonathansantilli/codegate-guardian/commit/a72782bda0602f02853a7684eb91635324e6bc16))
* **console:** a way out, and a way back to the first run ([877cb98](https://github.com/jonathansantilli/codegate-guardian/commit/877cb9804819097b2900d05a8997e2bdeb518d5e))
* **console:** build suppression and owner assignment, and collapse duplication ([f5421f1](https://github.com/jonathansantilli/codegate-guardian/commit/f5421f154d9efabd062993594233e1cb2e555c03))
* **console:** build the fleet console to the sealed design ([1cbcf0d](https://github.com/jonathansantilli/codegate-guardian/commit/1cbcf0d35cde5119903207e447874e42e39e9108))
* **console:** evidence, lifecycle, policies, activity and access ([cb76768](https://github.com/jonathansantilli/codegate-guardian/commit/cb767687715b603512349b41f1f708f73e67e970))
* **console:** export, and the dead code a second audit turned up ([bdc2b6b](https://github.com/jonathansantilli/codegate-guardian/commit/bdc2b6bdfb01d07decf770f1a889fadc98f743a4))
* **console:** let an operator choose light or dark ([65ce25e](https://github.com/jonathansantilli/codegate-guardian/commit/65ce25ed01df5d65827605c39013c72442534172))
* **console:** render the scanner's own evidence verbatim ([d54cfc4](https://github.com/jonathansantilli/codegate-guardian/commit/d54cfc4eeebfadffada7b196c922b121d7390a7b))
* **docker:** self-hosted image and full compose stack ([f919e9f](https://github.com/jonathansantilli/codegate-guardian/commit/f919e9f0854f0724a6795d5c599dbdf03127eb64))
* finish the console and remove the app it grew inside ([df075cf](https://github.com/jonathansantilli/codegate-guardian/commit/df075cf65ec3cd1f136b3156dc2240c6937fb9de))
* **fleet:** a collection policy, closed until somebody opens it ([0ef65bd](https://github.com/jonathansantilli/codegate-guardian/commit/0ef65bdea708822c905d7b5a7c2e8d977151c64f))
* **fleet:** agent enrolment endpoint ([85b5cdf](https://github.com/jonathansantilli/codegate-guardian/commit/85b5cdf9274c48af6422e7cc0c60e8c7ec20d213))
* **fleet:** agent inventory ingest ([b2c84f6](https://github.com/jonathansantilli/codegate-guardian/commit/b2c84f630bf1685c52d25e7ee445b9fb2c906966))
* **fleet:** artifacts and people views in the console ([2baaf95](https://github.com/jonathansantilli/codegate-guardian/commit/2baaf95faca52fa4f40f01cd972cb89ec06adfc0))
* **fleet:** detect regressions, and let policies be authored ([1ff7708](https://github.com/jonathansantilli/codegate-guardian/commit/1ff7708d3642bb6d4d9b7a9770333e2be50a761c))
* **fleet:** identify artifacts by content hash ([b9046fb](https://github.com/jonathansantilli/codegate-guardian/commit/b9046fba01099bfedf8fa2b1d296a53bb77165bc))
* **fleet:** ingest findings, with lifecycle derived from report history ([954346d](https://github.com/jonathansantilli/codegate-guardian/commit/954346dc5581ea90932841f583ffda18814ecbcc))
* **fleet:** ownership, suppression with scope, and enrolment codes ([c1d0bb8](https://github.com/jonathansantilli/codegate-guardian/commit/c1d0bb8784015c174df6970553ece27546a9923c))
* **fleet:** render findings in the console ([da7a2bc](https://github.com/jonathansantilli/codegate-guardian/commit/da7a2bcae3f03dcb9daea209f0c6646aedd820da))
* **fleet:** wire the agent ingest token into the compose stack ([ef7c5d0](https://github.com/jonathansantilli/codegate-guardian/commit/ef7c5d08d5327054058cfd719ca2124222b6e8b1))
* **home:** a mark of its own, and a page that fills the width ([ac30004](https://github.com/jonathansantilli/codegate-guardian/commit/ac30004e6ce66983f25b4c3fe52f2d4685a6c09e))
* **home:** give "Back" somewhere to land ([a416dcc](https://github.com/jonathansantilli/codegate-guardian/commit/a416dcc1fcbed17d7b62b9dc8b6ea52244201e6a))
* **home:** open source, and a way to ask us to run it ([b7381ed](https://github.com/jonathansantilli/codegate-guardian/commit/b7381ed63548469f66939b1db055d1390d6e0d02))
* **home:** say what actually happens, not just what doesn't ([34fcffb](https://github.com/jonathansantilli/codegate-guardian/commit/34fcffbba1b198dc36da410608558aedaf37b675))
* improve scanning reliability and reporting experience ([aed5d2c](https://github.com/jonathansantilli/codegate-guardian/commit/aed5d2cd17e71e82a495f2e9906c2845b0830e05))
* ship reporting dashboard and resilient multi-skill scan flow ([fdaeb75](https://github.com/jonathansantilli/codegate-guardian/commit/fdaeb754adfb56f1394e62ea4559cab8b573e791))
