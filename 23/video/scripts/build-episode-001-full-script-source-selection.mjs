import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const candidateRoot = path.join(root, 'video', 'source-intake', 'episode-001', 'full-script-usable-v01');
const reviewRoot = path.join(root, 'video', 'qa', 'source-review', 'episode-001-full-script-usable-v01');
const specPath = path.join(root, 'video', 'episodes', 'episode-001', 'episode-spec.json');
const oldReviewPath = path.join(root, 'video', 'source-intake', 'episode-001', 'hanbang-live-action-v01', 'candidate-review.json');
const render = process.argv.includes('--render');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const run = (bin, args) => {
  const result = spawnSync(bin, args, {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
const clean = (value) => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();

fs.mkdirSync(candidateRoot, {recursive: true});
fs.mkdirSync(reviewRoot, {recursive: true});
const specBytes = fs.readFileSync(specPath);
const spec = JSON.parse(specBytes);
const expectedSpecSha256 = 'b89d99735668e6027c1ff19b2d81bf64b5f235fc4e3020513d1fc10f68d4f085';
if (sha256(specPath) !== expectedSpecSha256) throw new Error('episode spec drift; rebuild the selection matrix before using it');
if (spec.cuts.length !== 48) throw new Error('expected the approved 48-cut script');

const oldKoreanManifest = JSON.parse(fs.readFileSync(path.join(root, 'video', 'qa', 'source-review', 'episode-001-korean-usable-v01', 'manifest.json')));
const oldKorean = Object.fromEntries(oldKoreanManifest.sources.map((source) => [source.id, source]));
const commonRoot = path.join(candidateRoot, 'originals', 'wikimedia');
const sources = [
  {
    ...oldKorean['KOR-WM-SEOUL-BROLL-001'],
    expected_sha256: oldKorean['KOR-WM-SEOUL-BROLL-001'].sha256,
    path: path.join(root, oldKorean['KOR-WM-SEOUL-BROLL-001'].path),
    media_type: 'video', locale_priority: 'korea-located-primary',
  },
  {
    ...oldKorean['KOR-WM-ASSEMBLY-001'],
    expected_sha256: oldKorean['KOR-WM-ASSEMBLY-001'].sha256,
    path: path.join(root, oldKorean['KOR-WM-ASSEMBLY-001'].path),
    media_type: 'video', locale_priority: 'korean-institution-primary',
  },
  {
    ...oldKorean['KOR-WM-SEOUL-STREET-001'],
    expected_sha256: oldKorean['KOR-WM-SEOUL-STREET-001'].sha256,
    path: path.join(root, oldKorean['KOR-WM-SEOUL-STREET-001'].path),
    media_type: 'video', locale_priority: 'korea-located-primary',
  },
  {
    id: 'KOR-WM-A-DAY-SEOUL-001', media_type: 'video', path: path.join(commonRoot, 'a-day-in-seoul.webm'), expected_sha256: '5afee665df2aff2ac91c733713b910269f384cfa2cb159c8f017e7231b1cae95',
    title: 'A Day in Seoul', creator: 'Scott Herder', item_url: 'https://commons.wikimedia.org/wiki/File:A_Day_in_Seoul.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/A_Day_in_Seoul.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/A_Day_in_Seoul.webm', downloaded_representation: 'original Commons file', license: 'CC BY 3.0', license_url: 'https://creativecommons.org/licenses/by/3.0', attribution: 'A Day in Seoul — Scott Herder, CC BY 3.0, via Wikimedia Commons', locale_priority: 'korea-located-primary',
  },
  {
    id: 'WM-UNBOXING-ACTION-CAM-001', media_type: 'video', path: path.join(commonRoot, 'unboxing-action-cam.webm'), expected_sha256: '30ee40e07c40a4da2902582cb3cfadafdcad2d4e8d2577facbf085ac0504cc1d',
    title: 'Unboxing Action Cam Apeman A66', creator: 'Takezo', item_url: 'https://commons.wikimedia.org/wiki/File:Unboxing_Action_Cam_Apeman_A66.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Unboxing_Action_Cam_Apeman_A66.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Unboxing_Action_Cam_Apeman_A66.webm', downloaded_representation: 'original Commons file', license: 'CC BY 3.0', license_url: 'https://creativecommons.org/licenses/by/3.0', attribution: 'Unboxing Action Cam Apeman A66 — Takezo, CC BY 3.0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-DOCUMENT-SCANNING-001', media_type: 'video', path: path.join(commonRoot, 'document-scanning.webm'), expected_sha256: '883229e6cb6003eeb15088488ad9d77399753fde77fcd12d8e38914729611c7e',
    title: 'Document scanning action video with document scanner Fujitsu ScanSnap S1500', creator: 'Ucheniitza', item_url: 'https://commons.wikimedia.org/wiki/File:Document_scanning_action_video_with_document_scanner_Fujitsu_ScanSnap_S1500.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Document_scanning_action_video_with_document_scanner_Fujitsu_ScanSnap_S1500.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Document_scanning_action_video_with_document_scanner_Fujitsu_ScanSnap_S1500.webm', downloaded_representation: 'original Commons file', license: 'CC BY-SA 3.0', license_url: 'https://creativecommons.org/licenses/by-sa/3.0', attribution: 'Document scanning action video — Ucheniitza, CC BY-SA 3.0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-LAW-SCHOOL-PHOTOCOPIER-001', media_type: 'video', path: path.join(commonRoot, 'law-school-photocopier.webm'), expected_sha256: 'd112a9113d45b79ae9c3ac5a87228d4ead43d6d5beee0412f3001918706d887b',
    title: 'Konica Minolta photocopier with an automatic document feeder, School of Law, Singapore Management University', creator: 'Smuconlaw', item_url: 'https://commons.wikimedia.org/wiki/File:Konica_Minolta_photocopier_with_an_automatic_document_feeder,_School_of_Law,_Singapore_Management_University_-_20140611.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Konica_Minolta_photocopier_with_an_automatic_document_feeder%2C_School_of_Law%2C_Singapore_Management_University_-_20140611.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Konica_Minolta_photocopier_with_an_automatic_document_feeder%2C_School_of_Law%2C_Singapore_Management_University_-_20140611.webm', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Konica Minolta photocopier, School of Law, Singapore Management University — Smuconlaw, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-LAPTOP-TYPING-001', media_type: 'photo', path: path.join(commonRoot, 'laptop-typing.jpg'), expected_sha256: '1bbabea1708b99281426d19a23fb5a57a80b5f21856545c4bc5c26aa0cfcd249',
    title: 'Hand-laptop-notebook-typing', creator: 'www.Pixel.la Free Stock Photos', item_url: 'https://commons.wikimedia.org/wiki/File:Hand-laptop-notebook-typing_(23698140194).jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Hand-laptop-notebook-typing_%2823698140194%29.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Hand-laptop-notebook-typing_%2823698140194%29.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Hand-laptop-notebook-typing — www.Pixel.la Free Stock Photos, CC0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-CCTV-BRICK-WALL-001', media_type: 'photo', path: path.join(commonRoot, 'cctv-brick-wall.jpg'), expected_sha256: '49ecbc6596e52cd21a971ec575b7ec8fc41d1e674c3e651b932755cc7aee67aa',
    title: 'CCTVBrickWall', creator: 'Raysonho @ Open Grid Scheduler / Grid Engine', item_url: 'https://commons.wikimedia.org/wiki/File:CCTVBrickWall.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/CCTVBrickWall.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/CCTVBrickWall.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'CCTVBrickWall — Raysonho, CC0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-OPENING-MAILER-001', media_type: 'photo', path: path.join(commonRoot, 'opening-paperboard-mailer.jpg'), expected_sha256: '8b69dc3840c1fa452fcfcbba914ad8479f16654de7af96154f5dc0cbf4f3c917',
    title: 'Opening paperboard mailer', creator: 'Pkgx', item_url: 'https://commons.wikimedia.org/wiki/File:Opening_paperboard_mailer.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Opening_paperboard_mailer.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Opening_paperboard_mailer.jpg', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Opening paperboard mailer — Pkgx, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'WM-PHONE-MESSAGING-001', media_type: 'photo', path: path.join(commonRoot, 'phone-messaging.jpg'), expected_sha256: '10bdf58d0d3a16ed3032bb6d984855cc6cbbd813add75bd7245d9d3d3279aaa1',
    title: 'Businesswoman in uniform typing messages on mobile phone closeup', creator: 'Nenad Stojkovic', item_url: 'https://commons.wikimedia.org/wiki/File:Businesswoman_in_uniform_sitting_on_a_chair_and_typing_messages_on_mobile_phone_closeup._(51528514453).jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Businesswoman_in_uniform_sitting_on_a_chair_and_typing_messages_on_mobile_phone_closeup._%2851528514453%29.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Businesswoman_in_uniform_sitting_on_a_chair_and_typing_messages_on_mobile_phone_closeup._%2851528514453%29.jpg', downloaded_representation: 'original Commons file', license: 'CC BY 2.0', license_url: 'https://creativecommons.org/licenses/by/2.0', attribution: 'Businesswoman typing messages on mobile phone closeup — Nenad Stojkovic, CC BY 2.0, via Wikimedia Commons', locale_priority: 'universal-action-fallback',
  },
  {
    id: 'KOR-WM-POLICE-BUILDING-001', media_type: 'photo', path: path.join(root, 'data', 'raw', 'wikimedia', '106', 'photo', 'wikimedia-3243833.jpg'), expected_sha256: '3326cbf1eed16eb0f870c4c889279e08f251a310d2b98e1db92437901f49296c',
    title: 'Korean National Police Agency Building02', creator: 'Gohsuke Takama', item_url: 'https://commons.wikimedia.org/wiki/File:Korean_National_Police_Agency_Building02.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Korean_National_Police_Agency_Building02.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Korean_National_Police_Agency_Building02.jpg/1920px-Korean_National_Police_Agency_Building02.jpg', downloaded_representation: 'Commons-hosted 1920px derivative of the identified original file', license: 'CC BY 2.0', license_url: 'https://creativecommons.org/licenses/by/2.0', attribution: 'Korean National Police Agency Building02 — Gohsuke Takama, CC BY 2.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'WM-TYPING-EXAMPLE-001', media_type: 'video', path: path.join(commonRoot, 'typing-example.ogv'), expected_sha256: 'd082a8bbf3949491dd2b9aeb785b162bae6f882463621cf89f4f8218b9ccc1a4',
    title: 'Typing example', creator: 'NotFromUtrecht', item_url: 'https://commons.wikimedia.org/wiki/File:Typing_example.ogv', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Typing_example.ogv', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Typing_example.ogv', downloaded_representation: 'original Commons file', license: 'CC BY-SA 3.0', license_url: 'https://creativecommons.org/licenses/by-sa/3.0', attribution: 'Typing example — NotFromUtrecht, CC BY-SA 3.0, via Wikimedia Commons', locale_priority: 'universal-document-action-fallback',
  },
  {
    id: 'WM-OLIVETTI-DOCUMENT-TYPING-001', media_type: 'video', path: path.join(commonRoot, 'olivetti-document-typing.webm'), expected_sha256: '69ca7634118beb088926be1a3cc26052389e8196869b89a0c6b89515b245f224',
    title: 'Olivetti Lettera 22 — typing a document using tab stops', creator: 'IIVQ', item_url: 'https://commons.wikimedia.org/wiki/File:Olivetti_Lettera_22_-_typing_a_document_using_tab_stops.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/48/Olivetti_Lettera_22_-_typing_a_document_using_tab_stops.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/48/Olivetti_Lettera_22_-_typing_a_document_using_tab_stops.webm', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Olivetti Lettera 22 document typing — IIVQ, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'universal-document-action-fallback',
  },
  {
    id: 'WM-MOVING-ARCHIVE-CABINETS-001', media_type: 'video', path: path.join(commonRoot, 'moving-archive-cabinets.webm'), expected_sha256: '7c158eac45ef6927babc3e8eff7d3ab9ad11a28e6cee6b9424575b44d0acd4a3',
    title: 'Moving archive cabinets in IHLIA depot', creator: 'Ciell', item_url: 'https://commons.wikimedia.org/wiki/File:Moving_archive_cabinets_in_IHLIA_depot.webm', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Moving_archive_cabinets_in_IHLIA_depot.webm', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Moving_archive_cabinets_in_IHLIA_depot.webm', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Moving archive cabinets in IHLIA depot — Ciell, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'universal-record-management-fallback',
  },
  {
    id: 'WM-MAN-WRITING-PAPER-001', media_type: 'photo', path: path.join(commonRoot, 'man-writing-paper.jpg'), expected_sha256: 'b85f3979ed853550a1a20773fff4b08f12f772b411a67fb4a123737280d6893e',
    title: 'Man writing on paper (Unsplash)', creator: 'Olu Eletu / flenjoore', item_url: 'https://commons.wikimedia.org/wiki/File:Man_writing_on_paper_(Unsplash).jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Man_writing_on_paper_%28Unsplash%29.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Man_writing_on_paper_%28Unsplash%29.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Man writing on paper — Olu Eletu / flenjoore, CC0, via Wikimedia Commons', locale_priority: 'universal-document-action-fallback',
  },
  {
    id: 'KOR-WM-SEOUL-PROSECUTION-OFFICE-001', media_type: 'photo', path: path.join(commonRoot, 'seoul-high-prosecution-office.jpg'), expected_sha256: '62a95d4eebe95bb63587c627df4416f6a93cc05dd5b06457864c2912095846df',
    title: "Seoul High Prosecution's Office", creator: 'Neoalpha', item_url: "https://commons.wikimedia.org/wiki/File:Seoul_High_Prosecution%27s_Office.jpg", original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Seoul_High_Prosecution%27s_Office.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Seoul_High_Prosecution%27s_Office.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Seoul High Prosecution\'s Office — Neoalpha, CC0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-SUPREME-PROSECUTOR-DOORPLATE-001', media_type: 'photo', path: path.join(commonRoot, 'supreme-prosecutor-office-doorplate.jpg'), expected_sha256: '8974e31a4257544542d13959333a457e0d8f7be0cb221becaaaec37c0dffe70c',
    title: "Supreme Prosecutor's Office doorplate", creator: '고려', item_url: "https://commons.wikimedia.org/wiki/File:Supreme_Prosecutor%27s_Office_doorplate.jpg", original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Supreme_Prosecutor%27s_Office_doorplate.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Supreme_Prosecutor%27s_Office_doorplate.jpg', downloaded_representation: 'original Commons file', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0', attribution: 'Supreme Prosecutor\'s Office doorplate — 고려, CC BY 4.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-SEOUL-WESTERN-COURT-001', media_type: 'photo', path: path.join(commonRoot, 'seoul-western-district-court.jpg'), expected_sha256: '837900064e2a4b6c4b7fb68e2a3ec082a67ad0286e042bacc2a64c1f890f6864',
    title: 'Seoul Seobu Local Court', creator: '95016maphack', item_url: 'https://commons.wikimedia.org/wiki/File:Seoul_Seobu_Local_Court.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Seoul_Seobu_Local_Court.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Seoul_Seobu_Local_Court.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Seoul Seobu Local Court — 95016maphack, CC0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-SEOUL-EAST-COURT-001', media_type: 'photo', path: path.join(commonRoot, 'seoul-east-district-court-entrance.jpg'), expected_sha256: '01c21e3f38f5ab5226addd4bf8005ec8d0d820d868557f79de3e6d71e7096aa9',
    title: '서울동부지법 건물 출입구', creator: 'Pectus Solentis', item_url: 'https://commons.wikimedia.org/wiki/File:서울동부지법_건물_출입구.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/서울동부지법_건물_출입구.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/서울동부지법_건물_출입구.jpg', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: '서울동부지법 건물 출입구 — Pectus Solentis, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'WM-DESK-CALENDAR-001', media_type: 'photo', path: path.join(commonRoot, 'desk-calendar.jpg'), expected_sha256: '2f16084f075e4a526d659a07fe046c11cd8d6385dc266587be7a98b09fda5b64',
    title: 'Desk calendar 2022 July 11', creator: 'Nesnad', item_url: 'https://commons.wikimedia.org/wiki/File:Desk_calendar_2022_July_11_-_03-53PM.jpeg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Desk_calendar_2022_July_11_-_03-53PM.jpeg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Desk_calendar_2022_July_11_-_03-53PM.jpeg', downloaded_representation: 'original Commons file', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0', attribution: 'Desk calendar 2022 July 11 — Nesnad, CC BY 4.0, via Wikimedia Commons', locale_priority: 'universal-deadline-context-fallback',
  },
  {
    id: 'KOR-WM-NAMDAEMUN-POLICE-001', media_type: 'photo', path: path.join(commonRoot, 'seoul-namdaemun-police-station.jpg'), expected_sha256: '26095f5df1f0233ce64a99673caf322c4e6b21137db8e75ad02a31034180876c',
    title: 'Seoul Namdaemun Police Station', creator: 'LERK', item_url: 'https://commons.wikimedia.org/wiki/File:Seoul_namdaemun_police_station_20180916_120014.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Seoul_namdaemun_police_station_20180916_120014.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Seoul_namdaemun_police_station_20180916_120014.jpg', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Seoul Namdaemun Police Station — LERK, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-ANYANG-MANAN-POLICE-001', media_type: 'photo', path: path.join(commonRoot, 'anyang-manan-police-station.jpg'), expected_sha256: 'b3c0d1e7802f6fa10307ad8f325637dfead8c55cc719d507dfccace7a4a35acb',
    title: 'Anyang Manan Police Station', creator: 'LandAndTree', item_url: 'https://commons.wikimedia.org/wiki/File:Anyang_Manan_Police_Station_20240722_(01).jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Anyang_Manan_Police_Station_20240722_%2801%29.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Anyang_Manan_Police_Station_20240722_%2801%29.jpg', downloaded_representation: 'original Commons file', license: 'CC0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Anyang Manan Police Station — LandAndTree, CC0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-DAEJEON-COURT-001', media_type: 'photo', path: path.join(commonRoot, 'daejeon-district-court.jpg'), expected_sha256: 'f44ad9d9fea1b48375a016ffe44bc534777dff0faae2b169fad1c7ddd9cff74d',
    title: 'Daejeon District Court', creator: 'Minseong Kim', item_url: 'https://commons.wikimedia.org/wiki/File:Daejeon_District_Court.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Daejeon_District_Court.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Daejeon_District_Court.jpg', downloaded_representation: 'original Commons file', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', attribution: 'Daejeon District Court — Minseong Kim, CC BY-SA 4.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'KOR-WM-CHUNCHEON-COURT-001', media_type: 'photo', path: path.join(commonRoot, 'chuncheon-district-court.jpg'), expected_sha256: '75834dc829070baed44f7dd4290ac9c2dba6152971260bc24e82e6b1adc22ecf',
    title: 'Chuncheon District Court', creator: 'Twotwo2019', item_url: 'https://commons.wikimedia.org/wiki/File:Chuncheon_District_Court-01.jpg', original_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Chuncheon_District_Court-01.jpg', downloaded_file_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Chuncheon_District_Court-01.jpg', downloaded_representation: 'original Commons file', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0', attribution: 'Chuncheon District Court — Twotwo2019, CC BY 4.0, via Wikimedia Commons', locale_priority: 'korean-institution-primary',
  },
  {
    id: 'PEXELS-DOCUMENT-STACK-412', media_type: 'photo', path: path.join(root, 'data', 'raw', 'pexels-media', '207', 'photo', 'pexels-34369598.jpg'), expected_sha256: 'cceed745fc4a36fa20d4d1ef5c7ab6fc8bb2dc36f4d07ba07080902958594c4a',
    title: 'Document stack on an office desk', creator: 'El Jundi', item_url: 'https://www.pexels.com/ko-kr/photo/34369598/', original_file_url: 'https://www.pexels.com/ko-kr/photo/34369598/', downloaded_file_url: 'existing locally acquired Pexels original candidate 412', downloaded_representation: 'existing local original candidate; item and current provider terms reviewed', license: 'Pexels License', license_url: 'https://www.pexels.com/legal-pages/license/', attribution: 'Document stack on an office desk — El Jundi, Pexels', locale_priority: 'universal-object-only-fallback',
  },
];

const acceptedLicenses = new Set(['CC0', 'Public domain', 'CC BY 2.0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'Pexels License']);
let inventory = sources.map((source) => {
  if (!fs.existsSync(source.path)) throw new Error(`missing source ${source.id}: ${source.path}`);
  const actualHash = sha256(source.path);
  if (actualHash !== source.expected_sha256) throw new Error(`source hash drift: ${source.id}`);
  if (!acceptedLicenses.has(source.license)) throw new Error(`license not accepted: ${source.id}`);
  for (const key of ['title', 'creator', 'item_url', 'license_url', 'attribution']) if (!source[key]) throw new Error(`missing ${key}: ${source.id}`);
  const info = probe(source.path);
  const stream = info.streams.find((item) => item.codec_type === 'video');
  if (!stream) throw new Error(`not decodable: ${source.id}`);
  const isVideo = source.media_type === 'video';
  const duration = isVideo ? Number(info.format.duration) : null;
  if (isVideo && !(duration > 0)) throw new Error(`video has no positive duration: ${source.id}`);
  return {...source, path: rel(source.path), sha256: actualHash, bytes: fs.statSync(source.path).size, duration_seconds: duration, width: stream.width, height: stream.height, fps: isVideo ? stream.avg_frame_rate : null, source_audio_present: isVideo && info.streams.some((item) => item.codec_type === 'audio'), source_audio_treatment: isVideo ? 'removed/muted in review reel' : 'not-applicable', rights_status: 'commercial-derivative-item-license-verified', commercial_use_allowed: true, derivative_use_allowed: true, retrieved_date: '2026-09-09', attribution_ready: true, production_authority: false};
});
const byId = Object.fromEntries(inventory.map((source) => [source.id, source]));

const video = (source_id, start_seconds, frames, role, semantic_limit) => ({kind: 'video-window', source_id, start_seconds, end_seconds: +(start_seconds + frames / 30).toFixed(6), frames, role, semantic_limit});
const photo = (source_id, frames, role, semantic_limit, treatment = 'documentary-ken-burns') => ({kind: 'photo-hold', source_id, frames, duration_seconds: +(frames / 30).toFixed(6), role, semantic_limit, treatment});
const genericLimit = 'general contextual B-roll only; not footage of the named amendment, debate, investigation, victim, or evidentiary event';
const actionLimit = 'illustrative universal action for the explicitly fictional scenario; not an actual Korean victim, transaction, police case, or evidentiary record';
const institutionalLimit = 'general Korean institution/location context only; not the named debate, meeting, vote, or investigation';
const assignments = {
  SH001: [video('KOR-WM-ASSEMBLY-001', 0, 144, '대한민국 국회의사당 establishing', institutionalLimit)],
  SH002: [video('KOR-WM-ASSEMBLY-001', 4.8, 144, '정치권 논의를 상징하는 국회의사당 후속 전경', institutionalLimit)],
  SH003: [video('KOR-WM-ASSEMBLY-001', 9.6, 260, '국회의사당 외관으로 정치권 논의의 실제 한국 기관 맥락을 제시', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 121, '서울고검·중앙지검 외관으로 정책 변화의 적용 기관 맥락을 연결', institutionalLimit)],
  SH009: [video('WM-DOCUMENT-SCANNING-001', 0, 240, '사건 기록을 전자화하는 문서 처리', genericLimit), video('WM-MOVING-ARCHIVE-CABINETS-001', 0, 177, '기록과 증거를 보관·이동하는 자료 관리', genericLimit)],
  SH010: [photo('KOR-WM-POLICE-BUILDING-001', 125, '신고가 접수되는 한국 경찰기관', institutionalLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 125, '사건 기록이 있는 지역 경찰기관', institutionalLimit), photo('WM-MAN-WRITING-PAPER-001', 125, '기록 위치와 처리 상태를 확인하는 문서 업무', genericLimit)],
  SH012: [video('WM-TYPING-EXAMPLE-001', 0, 90, '삭제 문구만으로 역할 전체를 단정하지 않도록 원문을 확인하는 업무', genericLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 97, '삭제 뒤에도 별도 직무를 수행하는 검찰기관 맥락', institutionalLimit), photo('KOR-WM-POLICE-BUILDING-001', 97, '검사의 요구를 받아 확인하는 수사기관 맥락', institutionalLimit)],
  SH016: [video('WM-LAW-SCHOOL-PHOTOCOPIER-001', 0, 120, '구체적 요구에 붙는 사건 서류 처리', genericLimit), photo('WM-MAN-WRITING-PAPER-001', 82, '빠진 확인 대상과 이유를 적는 문서 작성', genericLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 82, '요구를 받아 보완하는 한국 수사기관 맥락', institutionalLimit)],
  SH017: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 0, 120, '확인 대상과 이유가 드러나는 요구서 작성 행동', genericLimit), photo('WM-MAN-WRITING-PAPER-001', 67, '한마디가 아닌 구체 문서를 작성하는 손', genericLimit), video('WM-DOCUMENT-SCANNING-001', 8, 67, '작성된 요구서를 기록으로 편입하는 처리', genericLimit)],
  SH018: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 4, 90, '이유와 내용을 구체화하는 문서 작성', genericLimit), video('WM-DOCUMENT-SCANNING-001', 10.233333, 68, '구체 요구서를 기록으로 남기는 처리', genericLimit)],
  SH020: [video('WM-TYPING-EXAMPLE-001', 3, 150, '관리 시스템에 요구·처리 상태를 입력하는 일반 업무', genericLimit), photo('WM-LAPTOP-TYPING-001', 113, '누가 언제 무엇을 요구했는지 기록하는 업무', genericLimit), video('WM-DOCUMENT-SCANNING-001', 12.5, 112, '결과 문서를 시스템 기록으로 편입', genericLimit)],
  SH021: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 7, 90, '기간 기준이 붙는 요구 문서 작성', genericLimit), photo('KOR-WM-POLICE-BUILDING-001', 122, '한 달 이행 의무를 수행하는 수사기관 맥락', institutionalLimit)],
  SH022: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 10, 90, '보완수사 요구 이행 문서', genericLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 109, '한 달 기준 안에서 요구를 이행하는 경찰기관', institutionalLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 109, '신고 이후 별도로 이어지는 수사기관 단계', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 109, '결과를 통보받고 다음 절차를 진행하는 검찰기관', institutionalLimit)],
  SH023: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 13, 120, '요구를 받은 날과 별도 기간을 문서화', genericLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 104, '원칙 기간 안에서 보완하는 담당 경찰기관', institutionalLimit), photo('WM-MAN-WRITING-PAPER-001', 103, '상당한 이유와 연장 사유를 문서로 작성', genericLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 103, '별도 기간을 정하는 검찰기관 맥락', institutionalLimit)],
  SH024: [video('WM-MOVING-ARCHIVE-CABINETS-001', 5.9, 82, '사건별로 다른 기록 묶음을 관리', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 72, '사건마다 다른 확인을 맡은 지역 경찰기관', institutionalLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 72, '서로 다른 사건 조건과 담당 기관', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 71, '일괄 기한이 아니라 사건별 요구를 판단하는 검찰기관', institutionalLimit)],
  SH025: [video('WM-LAW-SCHOOL-PHOTOCOPIER-001', 4, 60, '보완이 어려운 사건 서류를 다음 경로로 넘기는 처리', genericLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 61, '다른 수사기관으로 이어질 수 있는 한국 경찰기관', institutionalLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 61, '조건에 따라 지정될 다음 수사기관 맥락', institutionalLimit)],
  SH026: [photo('KOR-WM-POLICE-BUILDING-001', 117, '담당 경찰이 속한 수사관서', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 117, '기관 지정을 요구하는 공소청 맥락', institutionalLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 117, '상급 수사관서 또는 다른 수사기관 지정 맥락', institutionalLimit)],
  SH027: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 17, 90, '적절한 보완을 기대하기 어려운 조건을 문서화', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 81, '조건에 따라 지정될 수 있는 다른 수사기관', institutionalLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 81, '자동 이관이 아니라 조건에 따라 달라지는 담당 기관', institutionalLimit), photo('WM-MAN-WRITING-PAPER-001', 81, '조건 판단 사유를 기록', genericLimit)],
  SH031: [photo('KOR-WM-POLICE-BUILDING-001', 75, '불송치 결과를 낸 한국 경찰기관 맥락', institutionalLimit), photo('WM-MAN-WRITING-PAPER-001', 75, '고소인·피해자가 별도 이의 문서를 작성하는 행동', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 74, '이의 제기가 시작되는 별도 경찰 절차 맥락', institutionalLimit)],
  SH032: [video('WM-DOCUMENT-SCANNING-001', 16.233333, 82, '재수사요구 문서를 별도 절차 기록으로 처리', genericLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 72, '재수사를 요구하는 검찰기관', institutionalLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 72, '재수사요구를 받는 경찰기관', institutionalLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 71, '보완수사요구와 구분된 재수사 절차의 경찰기관', institutionalLimit)],
  SH033: [video('WM-LAW-SCHOOL-PHOTOCOPIER-001', 7, 120, '공소 제기·유지에 필요한 자료 제출과 복사', genericLimit), photo('WM-MAN-WRITING-PAPER-001', 70, '의견서 작성', genericLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 70, '의견·자료를 받는 검찰기관', institutionalLimit)],
  SH034: [video('WM-TYPING-EXAMPLE-001', 8, 120, '면담 진술·자료를 사실관계 확인 기록으로 입력', genericLimit), photo('KOR-WM-SEOUL-WESTERN-COURT-001', 67, '재판에서의 증거 사용 여부를 구분하는 법원 맥락', institutionalLimit), photo('WM-MAN-WRITING-PAPER-001', 67, '면담 진술·자료가 작성되는 일반 문서 행동', genericLimit), photo('KOR-WM-DAEJEON-COURT-001', 67, '자료의 재판 증거 사용을 구분하는 법원 맥락', institutionalLimit)],
  SH035: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 20, 90, '확인 기록을 작성하는 권한', genericLimit), photo('KOR-WM-CHUNCHEON-COURT-001', 67, '확인 자료가 이어지는 한국 사법기관', institutionalLimit), photo('KOR-WM-SEOUL-EAST-COURT-001', 67, '재판 증거 사용 권한과 구분되는 법원 맥락', institutionalLimit)],
  SH036: [video('WM-TYPING-EXAMPLE-001', 12, 90, '개정 내용과 시행일을 확인하는 일반 문서 업무', genericLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 70, '시행일 뒤 새 절차를 적용할 경찰기관', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 70, '시행일 뒤 새 절차를 적용할 검찰기관', institutionalLimit)],
  SH037: [video('WM-TYPING-EXAMPLE-001', 15, 60, '공포 문서와 실제 변경일을 따로 확인하는 업무', genericLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 84, '공포 뒤 실제 시행일까지 제도를 준비하는 검찰기관', institutionalLimit)],
  SH038: [video('WM-TYPING-EXAMPLE-001', 17, 90, '조항별 시행일과 적용례를 따로 확인하는 문서 업무', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 67, '조항별 시행일을 적용하는 경찰기관', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 67, '시행 당시 검사가 맡은 사건의 적용례를 판단하는 검찰기관', institutionalLimit)],
  SH039: [video('WM-OLIVETTI-DOCUMENT-TYPING-001', 23, 120, '종전 규정 사건과 90일 한도를 문서로 확인', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 90, '송치된 기존 사건의 수사기관 출발점', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 90, '시행 당시 검사가 수사 중인 사건의 기관 맥락', institutionalLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 89, '조건부 전환 기간 뒤 보완을 맡을 경찰기관', institutionalLimit), photo('KOR-WM-POLICE-BUILDING-001', 89, '일반 연장이 아니라 기관 간 전환이 필요한 사건 맥락', institutionalLimit)],
  SH040: [video('WM-TYPING-EXAMPLE-001', 20, 150, '경과조치 조건과 시행 뒤 처리 자료를 입력·검토', genericLimit), video('WM-OLIVETTI-DOCUMENT-TYPING-001', 27, 120, '개정문과 조건부 경과조치를 문서로 작성', genericLimit), photo('KOR-WM-NAMDAEMUN-POLICE-001', 81, '조건부 경과조치 이후 사건을 처리할 경찰기관', institutionalLimit), photo('KOR-WM-SEOUL-PROSECUTION-OFFICE-001', 81, '시행 뒤 실제 처리 자료가 나오는 검찰기관', institutionalLimit), photo('KOR-WM-ANYANG-MANAN-POLICE-001', 81, '처리 속도와 결과를 시행 뒤 확인할 경찰기관', institutionalLimit), photo('KOR-WM-POLICE-BUILDING-001', 80, '실제 처리 자료를 비교할 수사기관 맥락', institutionalLimit)],
};

const remotionCuts = new Set(['SH008', 'SH011', 'SH013', 'SH030', 'SH043', 'SH045', 'SH047']);
const omniCuts = new Set(['SH004','SH005','SH006','SH007','SH014','SH015','SH019','SH028','SH029','SH041','SH042','SH044','SH046','SH048']);
const sourceGaps = {};
const seenWindows = new Map();
const coverage = spec.cuts.map((cut) => {
  const exactSegments = assignments[cut.shot_id] ?? [];
  const visualNeed = cut.shot_id === 'SH003' ? '대한민국 국회의사당 외관에서 서울고검·중앙지검 외관으로 전환해 정치권 논의와 제도 적용 기관을 실제 한국 맥락으로 연결한다.' : cut.visual_action;
  if (remotionCuts.has(cut.shot_id)) {
    if (cut.production_mode !== 'remotion') throw new Error(`${cut.shot_id} expected remotion mode`);
    return {cut_id: cut.shot_id, production_mode: cut.production_mode, estimated_frames: cut.timing.provisional_duration_frames, estimated_seconds: +(cut.timing.provisional_duration_frames / 30).toFixed(3), narration: cut.draft_narration, visual_need: visualNeed, source_role: 'source-not-applicable-necessary-legal-relationship-graphic', coverage_status: 'source-not-applicable', selected_segments: [], blocker: clean(cut.motion_graphics_justification) || 'exact legal relationship or text requires a deterministic raster-free graphic; no footage can prove it'};
  }
  if (omniCuts.has(cut.shot_id)) {
    if (cut.production_mode !== 'omni') throw new Error(`${cut.shot_id} expected omni mode`);
    return {cut_id: cut.shot_id, production_mode: cut.production_mode, estimated_frames: cut.timing.provisional_duration_frames, estimated_seconds: +(cut.timing.provisional_duration_frames / 30).toFixed(3), narration: cut.draft_narration, visual_need: visualNeed, source_role: 'source-not-applicable-fictional-omni-keyframe-input', coverage_status: 'source-not-applicable-omni-keyframe-input', selected_segments: [], blocker: 'continuity-locked text-free Imagegen PNG keyframes and human keyframe review are pending; Omni video generation is forbidden until all 48 cuts receive user PASS'};
  }
  if (!exactSegments.length && sourceGaps[cut.shot_id]) return {cut_id: cut.shot_id, production_mode: cut.production_mode, estimated_frames: cut.timing.provisional_duration_frames, estimated_seconds: +(cut.timing.provisional_duration_frames / 30).toFixed(3), narration: cut.draft_narration, visual_need: visualNeed, source_role: 'source-gap-exact-period-relationship-unavailable', coverage_status: 'source-gap-blocked', selected_segments: [], blocker: sourceGaps[cut.shot_id], user_source_pass: false, user_cut_pass: false};
  if (!exactSegments.length) throw new Error(`no source assignment: ${cut.shot_id}`);
  const frames = exactSegments.reduce((sum, item) => sum + item.frames, 0);
  if (frames !== cut.timing.provisional_duration_frames) throw new Error(`${cut.shot_id} source frames ${frames} != ${cut.timing.provisional_duration_frames}`);
  for (const segment of exactSegments) {
    const source = byId[segment.source_id];
    if (!source) throw new Error(`${cut.shot_id} unknown source ${segment.source_id}`);
    if (segment.kind === 'video-window') {
      if (source.media_type !== 'video' || segment.start_seconds < 0 || segment.end_seconds > source.duration_seconds + 0.02) throw new Error(`${cut.shot_id} invalid window ${segment.source_id}`);
      const windows = seenWindows.get(segment.source_id) ?? [];
      for (const prior of windows) if (segment.start_seconds < prior.end_seconds - 0.001 && segment.end_seconds > prior.start_seconds + 0.001) throw new Error(`${cut.shot_id} overlaps ${prior.cut_id} in ${segment.source_id}`);
      windows.push({cut_id: cut.shot_id, start_seconds: segment.start_seconds, end_seconds: segment.end_seconds});
      seenWindows.set(segment.source_id, windows);
    } else if (source.media_type !== 'photo') throw new Error(`${cut.shot_id} photo hold requires photo source`);
  }
  return {cut_id: cut.shot_id, production_mode: cut.production_mode, estimated_frames: cut.timing.provisional_duration_frames, estimated_seconds: +(cut.timing.provisional_duration_frames / 30).toFixed(3), narration: cut.draft_narration, visual_need: visualNeed, source_role: cut.production_mode === 'source-photo' ? 'rights-cleared-real-photo-with-documentary-reframe' : 'rights-cleared-real-video-photo-workflow', coverage_status: 'source-selected-rights-verified-local-decodable', selected_segments: exactSegments, source_audio_treatment: 'muted/removed in preview', user_source_pass: false, user_cut_pass: false};
});
const usedSourceIds = new Set(coverage.flatMap((cut) => cut.selected_segments.map((segment) => segment.source_id)));
inventory = inventory.filter((source) => usedSourceIds.has(source.id));
for (const removedId of ['KOR-WM-A-DAY-SEOUL-001', 'KOR-WM-SEOUL-BROLL-001', 'KOR-WM-SEOUL-STREET-001', 'WM-DESK-CALENDAR-001', 'KOR-WM-SUPREME-PROSECUTOR-DOORPLATE-001']) if (usedSourceIds.has(removedId)) throw new Error(`visually misleading source remains selected: ${removedId}`);
const courtSourceIds = new Set(['KOR-WM-SEOUL-WESTERN-COURT-001', 'KOR-WM-SEOUL-EAST-COURT-001', 'KOR-WM-DAEJEON-COURT-001', 'KOR-WM-CHUNCHEON-COURT-001']);
for (const cut of coverage) for (const segment of cut.selected_segments) if (courtSourceIds.has(segment.source_id) && !['SH034', 'SH035'].includes(cut.cut_id)) throw new Error(`court exterior used outside trial/evidence context: ${cut.cut_id}/${segment.source_id}`);
for (const cut of coverage.filter((item) => item.cut_id === 'SH025')) for (const segment of cut.selected_segments) if (segment.kind === 'photo-hold' && segment.frames < 60) throw new Error(`${cut.cut_id} has sub-two-second photo hold`);

const usageBySource = new Map();
let selectedSegmentCount = 0;
for (const cut of coverage) for (const segment of cut.selected_segments) {
  usageBySource.set(segment.source_id, (usageBySource.get(segment.source_id) ?? 0) + segment.frames);
  selectedSegmentCount += 1;
}
const selectedFrameTotal = coverage.filter((cut) => cut.coverage_status.startsWith('source-selected')).reduce((sum, cut) => sum + cut.estimated_frames, 0);
const usageMetrics = [...usageBySource].map(([source_id, frames]) => ({source_id, frames, seconds: +(frames / 30).toFixed(3), share_percent: +(frames * 100 / selectedFrameTotal).toFixed(1)})).sort((a, b) => b.frames - a.frames);
if (usageMetrics[0].share_percent >= 20) throw new Error(`single source share is too high: ${JSON.stringify(usageMetrics[0])}`);
const documentWorkflowIds = new Set(['WM-TYPING-EXAMPLE-001', 'WM-OLIVETTI-DOCUMENT-TYPING-001', 'WM-MOVING-ARCHIVE-CABINETS-001', 'WM-DOCUMENT-SCANNING-001', 'WM-LAW-SCHOOL-PHOTOCOPIER-001', 'WM-MAN-WRITING-PAPER-001', 'WM-LAPTOP-TYPING-001', 'PEXELS-DOCUMENT-STACK-412']);
const documentWorkflowFrames = [...usageBySource].filter(([sourceId]) => documentWorkflowIds.has(sourceId)).reduce((sum, [, frames]) => sum + frames, 0);
const documentWorkflowShare = +(documentWorkflowFrames * 100 / selectedFrameTotal).toFixed(1);
if (documentWorkflowShare >= 50) throw new Error(`document/typing semantic family remains over 50%: ${documentWorkflowShare}%`);

const oldReview = JSON.parse(fs.readFileSync(oldReviewPath));
const pexelsPersonRiskIds = new Set([415,414,413,410,409,408,407,406,405,404,403,402,401,400,399,398,397,395,394,393,392,389,388,387,386,385,384,383,382,380,379,378,377]);
const pexelsObjectIds = new Set([412,411,391,390]);
const evaluatedExisting = oldReview.candidates.map((item) => {
  let disposition = 'rejected-not-selected'; let reason = item.reason;
  if (item.id === 357) {disposition = 'selected-after-item-license-verification'; reason = 'Korean National Police Agency exterior; exact Commons item is CC BY 2.0 and the local 1920px representation is hash-bound.';}
  else if (item.id === 412) {disposition = 'rights-compatible-object-only-but-superseded'; reason = 'Neutral document stack has no depicted person and the current Pexels License permits editing, but it is no longer selected after the second semantic audit.';}
  else if (item.id === 396) {disposition = 'rejected-third-party-promotional-surveillance'; reason = 'Retail surveillance demonstration contains unrelated identifiable shoppers and promotional context; selecting it would risk false implication.';}
  else if (pexelsObjectIds.has(item.id)) {disposition = 'rights-compatible-object-only-but-superseded'; reason = 'Pexels License permits edited commercial YouTube use, but a Commons source with clearer CC/CC0 downstream terms and no political-person restriction was selected.';}
  else if (pexelsPersonRiskIds.has(item.id)) {disposition = 'rejected-pexels-political-context-person-depiction'; reason = 'Pexels current guidance bars content depicting a person from political policy/viewpoint contexts; the local frame contains a person or hands and is not used.';}
  return {candidate_id: item.id, provider: item.provider, media_type: item.media_type, local_path: rel(item.path), sha256: item.sha256, item_url: item.source_url, creator: item.creator, original_disposition: item.disposition, evaluation: disposition, reason};
});
const rejectedPending = {
  schema_version: 1, candidate_id: 'episode-001-full-script-usable-v01', generated_at: new Date().toISOString(),
  rights_terms: {
    pexels_license_url: 'https://www.pexels.com/legal-pages/license/',
    pexels_political_context_url: 'https://help.pexels.com/hc/en-us/articles/360043229813-Can-I-use-photos-and-videos-from-Pexels-in-a-political-campaign',
    retrieved_date: '2026-09-09',
    decision: 'Commercial editing is generally allowed, but Pexels person imagery is excluded from this policy-analysis video under the provider political-context restriction. Object-only candidates remain eligible after item/trademark review.',
  },
  route_failures: [
    {route: 'assembly-member-photos', result: 'success-new-0'},
    {route: 'KOGL-photo', result: 'new-1-rights-unresolved-not-selected'},
    {route: 'KOGL-video', result: 'new-1-text-illustration-not-live-action-and-rights-unresolved'},
    {route: 'digital-culture-api', result: 'service_error_200'},
    {route: 'LOC', result: 'HTTP-403'},
    {route: 'Pexels-live', result: 'no-current-key; existing local files evaluated under current official terms'},
    {route: 'KTV-item-level-video', result: 'rejected: reviewed clip states © Korea Policy Broadcasting Institute, unauthorized reproduction and redistribution prohibited'},
    {route: 'Korea-policy-briefing-media', result: 'rejected: KOGL Type 1 statement applies to text; photos, images, and video require separate rights-holder permission'},
    {route: 'Commons-KOGL1-Korean-meetings', result: 'rights-compatible but rejected for current cuts: exact named events or unrelated ministries would create false policy/procedure implication'},
    {route: 'direct-shoot', result: 'permanently excluded by editorial direction'},
  ],
  evaluated_existing_candidates: evaluatedExisting,
  removed_from_selection_after_fictional_continuity_correction: [
    {source_id:'WM-UNBOXING-ACTION-CAM-001', disposition:'rights-compatible-local-original-not-selected', reason:'Generic real unboxing cannot stand in for the scripted fictional purchase, wrong-item reveal, or closing continuity.'},
    {source_id:'WM-CCTV-BRICK-WALL-001', disposition:'rights-compatible-local-original-not-selected', reason:'Generic CCTV object imagery cannot stand in for the fictional case evidence continuity.'},
    {source_id:'WM-OPENING-MAILER-001', disposition:'rights-compatible-local-original-not-selected', reason:'Generic mailer imagery cannot stand in for the fictional parcel continuity.'},
  ],
};

const summary = {
  cuts_total: 48,
  source_selected_cuts: coverage.filter((cut) => cut.coverage_status.startsWith('source-selected')).length,
  necessary_remotion_cuts: coverage.filter((cut) => cut.coverage_status === 'source-not-applicable').length,
  omni_keyframe_input_planned_cuts: coverage.filter((cut) => cut.coverage_status === 'source-not-applicable-omni-keyframe-input').length,
  source_missing_cuts: coverage.filter((cut) => !cut.coverage_status.startsWith('source-selected') && !cut.coverage_status.startsWith('source-not-applicable')).length,
  selected_sources: inventory.length,
  selected_video_sources: inventory.filter((source) => source.media_type === 'video').length,
  selected_photo_sources: inventory.filter((source) => source.media_type === 'photo').length,
  selected_source_video_seconds: +inventory.filter((source) => source.media_type === 'video').reduce((sum, source) => sum + source.duration_seconds, 0).toFixed(3),
  source_selection_frames: coverage.filter((cut) => cut.coverage_status.startsWith('source-selected')).reduce((sum, cut) => sum + cut.estimated_frames, 0),
  source_selection_seconds: +(coverage.filter((cut) => cut.coverage_status.startsWith('source-selected')).reduce((sum, cut) => sum + cut.estimated_frames, 0) / 30).toFixed(3),
  selected_segments: selectedSegmentCount,
  average_contiguous_segment_seconds: +(selectedFrameTotal / 30 / selectedSegmentCount).toFixed(3),
  maximum_single_source_share_percent: usageMetrics[0].share_percent,
  maximum_single_source_id: usageMetrics[0].source_id,
  document_typing_workflow_frames: documentWorkflowFrames,
  document_typing_workflow_seconds: +(documentWorkflowFrames / 30).toFixed(3),
  document_typing_workflow_share_percent: documentWorkflowShare,
  removed_after_visual_audit: ['KOR-WM-A-DAY-SEOUL-001', 'KOR-WM-SEOUL-BROLL-001', 'KOR-WM-SEOUL-STREET-001', 'WM-DESK-CALENDAR-001', 'KOR-WM-SUPREME-PROSECUTOR-DOORPLATE-001'],
  necessary_graphic_frames: coverage.filter((cut) => cut.coverage_status === 'source-not-applicable').reduce((sum, cut) => sum + cut.estimated_frames, 0),
  pending_omni_keyframe_frames: coverage.filter((cut) => cut.coverage_status === 'source-not-applicable-omni-keyframe-input').reduce((sum, cut) => sum + cut.estimated_frames, 0),
};
if (summary.source_selected_cuts !== 27 || summary.necessary_remotion_cuts !== 7 || summary.omni_keyframe_input_planned_cuts !== 14 || summary.source_missing_cuts !== 0) throw new Error(`unexpected coverage ${JSON.stringify(summary)}`);

const rightsInventory = {schema_version: 1, candidate_id: 'episode-001-full-script-usable-v01', generated_at: new Date().toISOString(), status: 'rights-verified-source-selection-provisional', production_authority: false, user_source_pass: false, intended_use: 'edited and possibly monetized YouTube video', rights_metadata_snapshots: ['video/source-intake/episode-001/full-script-usable-v01/metadata/commons-semantic-video-search.json', 'video/source-intake/episode-001/full-script-usable-v01/metadata/commons-korean-institutions.json', 'video/source-intake/episode-001/full-script-usable-v01/metadata/commons-semantic-photo-search-c.json', 'video/source-intake/episode-001/full-script-usable-v01/metadata/korean-workflow-route-audit-v03.json', 'video/source-intake/episode-001/hanbang-live-action-v01/candidate-review.json'], distribution_obligation: 'The rendered source-selection adaptation is offered under CC BY-SA 4.0. Preserve every source attribution, source license link, and indication of cropping, reframing, timing selection, frame-rate conversion, and source-audio removal.', usage_metrics: usageMetrics, sources: inventory};
const matrix = {schema_version: 1, candidate_id: 'episode-001-full-script-usable-v01', generated_at: new Date().toISOString(), status: 'real-context-partially-covered-one-source-gap-fictional-omni-keyframes-pending', review_profile: 'source-video-selection', production_authority: false, user_source_pass: false, user_cut_pass: false, active_cut_root: null, approved_script_changed: false, episode_spec: {path: rel(specPath), sha256: expectedSpecSha256}, summary, cuts: coverage};
const edlCuts = []; let sourceOutputFrame = 0; let episodeFrame = 0;
for (const cut of coverage) {
  const timelineStart = episodeFrame; episodeFrame += cut.estimated_frames;
  if (!cut.coverage_status.startsWith('source-selected')) {edlCuts.push({cut_id: cut.cut_id, episode_start_frame: timelineStart, episode_end_frame: episodeFrame, included_in_source_reel: false, reason: cut.blocker}); continue;}
  edlCuts.push({cut_id: cut.cut_id, episode_start_frame: timelineStart, episode_end_frame: episodeFrame, source_reel_start_frame: sourceOutputFrame, source_reel_end_frame: sourceOutputFrame + cut.estimated_frames, included_in_source_reel: true, segments: cut.selected_segments}); sourceOutputFrame += cut.estimated_frames;
}
const edl = {schema_version: 1, candidate_id: 'episode-001-full-script-usable-v01', generated_at: new Date().toISOString(), production_authority: false, episode_frames_total: episodeFrame, episode_seconds_total: +(episodeFrame / 30).toFixed(3), source_reel_frames: sourceOutputFrame, source_reel_seconds: +(sourceOutputFrame / 30).toFixed(3), omitted_remotion_cuts: [...remotionCuts], omitted_pending_omni_keyframe_cuts: [...omniCuts], cuts: edlCuts};

fs.writeFileSync(path.join(candidateRoot, 'rights-inventory.json'), `${JSON.stringify(rightsInventory, null, 2)}\n`);
fs.writeFileSync(path.join(candidateRoot, 'coverage-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);
fs.writeFileSync(path.join(candidateRoot, 'rejected-pending-ledger.json'), `${JSON.stringify(rejectedPending, null, 2)}\n`);
fs.writeFileSync(path.join(candidateRoot, 'source-selection-edl.json'), `${JSON.stringify(edl, null, 2)}\n`);

let artifact = null;
const output = path.join(reviewRoot, 'EP001-Full-Script-Source-Selection-Reel-Provisional-v01.mp4');
if (render) {
  const temp = path.join(reviewRoot, '.segments'); fs.mkdirSync(temp, {recursive: true});
  const files = []; const renderedSegments = []; let index = 0;
  const assTime = (frames) => {
    const centiseconds = Math.max(1, Math.round(frames * 100 / 30));
    const hours = Math.floor(centiseconds / 360000);
    const minutes = Math.floor((centiseconds % 360000) / 6000);
    const seconds = Math.floor((centiseconds % 6000) / 100);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
  };
  const assEscape = (value) => clean(value).replaceAll('\\', '／').replaceAll('{', '（').replaceAll('}', '）');
  const narrationExcerpt = (value) => {
    const excerpt = clean(value).slice(0, 76);
    const pivot = excerpt.length > 40 ? excerpt.lastIndexOf(' ', 40) : -1;
    return pivot > 16 ? `${excerpt.slice(0, pivot)}\\N${excerpt.slice(pivot + 1)}` : excerpt;
  };
  const writeOverlay = (file, frames, cut, source, segment) => {
    const end = assTime(frames);
    const sourceWindow = segment.kind === 'video-window' ? `${segment.start_seconds.toFixed(3)}–${segment.end_seconds.toFixed(3)}초` : `사진 hold ${(segment.frames / 30).toFixed(3)}초`;
    const sourceLine = `${assEscape(source.title)} · ${assEscape(source.creator)}\\N${assEscape(source.license)} · ${assEscape(sourceWindow)}`;
    const body = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Cut,Malgun Gothic,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,1,0,7,42,42,38,1\nStyle: Narration,Malgun Gothic,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&HAA000000,0,0,0,0,100,100,0,0,3,1,0,1,42,42,88,1\nStyle: Source,Malgun Gothic,38,&H00D9EDE6,&H00FFFFFF,&H00000000,&HAA000000,0,0,0,0,100,100,0,0,3,1,0,1,42,42,42,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,${end},Cut,,0,0,0,,[${cut.cut_id}]\nDialogue: 0,0:00:00.00,${end},Narration,,0,0,0,,${narrationExcerpt(cut.narration)}\nDialogue: 0,0:00:00.00,${end},Source,,0,0,0,,${sourceLine}\n`;
    fs.writeFileSync(file, body);
  };
  for (const cut of coverage.filter((item) => item.coverage_status.startsWith('source-selected'))) {
    for (const segment of cut.selected_segments) {
      index += 1; const source = byId[segment.source_id]; const target = path.join(temp, `${String(index).padStart(3, '0')}-${cut.cut_id}.mp4`);
      const frames = segment.frames;
      const overlay = path.join(temp, `${String(index).padStart(3, '0')}-${cut.cut_id}.ass`);
      writeOverlay(overlay, frames, cut, source, segment);
      const overlayFilter = `ass='${rel(overlay)}'`;
      if (segment.kind === 'video-window') run('ffmpeg', ['-y', '-v', 'error', '-ss', String(segment.start_seconds), '-i', source.path, '-an', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,tpad=stop_mode=clone:stop_duration=1,${overlayFilter},format=yuv420p`, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', target]);
      else run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', source.path, '-an', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.00018,1.06)':d=1:s=1920x1080:fps=30,tpad=stop_mode=clone:stop_duration=1,${overlayFilter},format=yuv420p`, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', target]);
      files.push(target);
      renderedSegments.push({target, cut_id: cut.cut_id, segment_index: index, frames});
    }
  }
  const concatPath = path.join(temp, 'concat.txt'); fs.writeFileSync(concatPath, `${files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', '-movflags', '+faststart', output]);
  const info = probe(output); const stream = info.streams.find((item) => item.codec_type === 'video');
  artifact = {path: rel(output), sha256: sha256(output), bytes: fs.statSync(output).size, duration_seconds: Number(info.format.duration), width: stream.width, height: stream.height, fps: stream.avg_frame_rate, audio_streams: info.streams.filter((item) => item.codec_type === 'audio').length, included_source_cuts: summary.source_selected_cuts, included_segments: summary.selected_segments, omitted_source_gap_cuts: Object.keys(sourceGaps), omitted_remotion_cuts: [...remotionCuts], omitted_pending_omni_keyframe_cuts: [...omniCuts]};
  if (Math.abs(artifact.duration_seconds - edl.source_reel_seconds) > 0.034) throw new Error(`render duration drift: expected ${edl.source_reel_seconds}s, got ${artifact.duration_seconds}s`);
  const midpointCuts = edlCuts.filter((cut) => cut.included_in_source_reel);
  const midpointDir = path.join(temp, 'midpoints'); fs.mkdirSync(midpointDir, {recursive: true});
  midpointCuts.forEach((cut, midpointIndex) => {
    const midpointSeconds = (cut.source_reel_start_frame + (cut.source_reel_end_frame - cut.source_reel_start_frame) / 2) / 30;
    run('ffmpeg', ['-y', '-v', 'error', '-ss', midpointSeconds.toFixed(6), '-i', output, '-frames:v', '1', '-vf', 'scale=380:214:force_original_aspect_ratio=decrease,pad=380:214:(ow-iw)/2:(oh-ih)/2:color=black', '-q:v', '2', path.join(midpointDir, `${String(midpointIndex + 1).padStart(2, '0')}-${cut.cut_id}.jpg`)]);
  });
  run('python', [path.join(root, 'video', 'scripts', 'build-source-cut-contact-sheet.py'), '--input-dir', midpointDir, '--output', path.join(reviewRoot, 'contact-sheet.jpg'), '--expected-count', String(midpointCuts.length)]);
  const segmentMidpointDir = path.join(temp, 'segment-midpoints'); fs.mkdirSync(segmentMidpointDir, {recursive: true});
  renderedSegments.forEach((segment, segmentIndex) => {
    run('ffmpeg', ['-y', '-v', 'error', '-ss', Math.max(0, segment.frames / 60).toFixed(6), '-i', segment.target, '-frames:v', '1', '-vf', 'scale=380:214:force_original_aspect_ratio=decrease,pad=380:214:(ow-iw)/2:(oh-ih)/2:color=black', '-q:v', '2', path.join(segmentMidpointDir, `${String(segmentIndex + 1).padStart(3, '0')}-${segment.cut_id}.jpg`)]);
  });
  run('python', [path.join(root, 'video', 'scripts', 'build-source-cut-contact-sheet.py'), '--input-dir', segmentMidpointDir, '--output', path.join(reviewRoot, 'segment-contact-sheet.jpg'), '--expected-count', String(renderedSegments.length), '--columns', '5']);
  const readabilityDir = path.join(reviewRoot, 'readability-360x203'); fs.mkdirSync(readabilityDir, {recursive: true});
  const readabilityCuts = ['SH003', 'SH017', 'SH025', 'SH034', 'SH039', 'SH040'].map((id) => edlCuts.find((cut) => cut.cut_id === id));
  readabilityCuts.forEach((cut, sampleIndex) => {
    const midpointSeconds = (cut.source_reel_start_frame + (cut.source_reel_end_frame - cut.source_reel_start_frame) / 2) / 30;
    run('ffmpeg', ['-y', '-v', 'error', '-ss', midpointSeconds.toFixed(6), '-i', output, '-frames:v', '1', '-vf', 'scale=360:202:force_original_aspect_ratio=decrease,pad=360:203:(ow-iw)/2:(oh-ih)/2:color=black', '-q:v', '2', path.join(readabilityDir, `${String(sampleIndex + 1).padStart(2, '0')}-${cut.cut_id}.jpg`)]);
  });
  run('python', [path.join(root, 'video', 'scripts', 'build-source-cut-contact-sheet.py'), '--input-dir', readabilityDir, '--output', path.join(reviewRoot, 'readability-360x203-contact.jpg'), '--expected-count', String(readabilityCuts.length), '--columns', '3', '--cell-width', '360', '--cell-height', '203']);
  fs.rmSync(temp, {recursive: true, force: true});
} else if (fs.existsSync(output)) {
  const info = probe(output); const stream = info.streams.find((item) => item.codec_type === 'video');
  if (Math.abs(Number(info.format.duration) - edl.source_reel_seconds) <= 0.034) artifact = {path: rel(output), sha256: sha256(output), bytes: fs.statSync(output).size, duration_seconds: Number(info.format.duration), width: stream.width, height: stream.height, fps: stream.avg_frame_rate, audio_streams: info.streams.filter((item) => item.codec_type === 'audio').length, included_source_cuts: summary.source_selected_cuts, included_segments: summary.selected_segments, omitted_source_gap_cuts: Object.keys(sourceGaps), omitted_remotion_cuts: [...remotionCuts], omitted_pending_omni_keyframe_cuts: [...omniCuts]};
}
const contactPath = path.join(reviewRoot, 'contact-sheet.jpg');
const contactSheet = fs.existsSync(contactPath) ? {path: rel(contactPath), sha256: sha256(contactPath), bytes: fs.statSync(contactPath).size} : null;
const segmentContactPath = path.join(reviewRoot, 'segment-contact-sheet.jpg');
const segmentContactSheet = fs.existsSync(segmentContactPath) ? {path: rel(segmentContactPath), sha256: sha256(segmentContactPath), bytes: fs.statSync(segmentContactPath).size, segments: summary.selected_segments} : null;
const readabilityContactPath = path.join(reviewRoot, 'readability-360x203-contact.jpg');
const readabilityContactSheet = fs.existsSync(readabilityContactPath) ? {path: rel(readabilityContactPath), sha256: sha256(readabilityContactPath), bytes: fs.statSync(readabilityContactPath).size, sample_size: '360x203', samples: 6} : null;

const h = (value) => clean(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sourceRows = inventory.map((source) => `<tr><td><strong>${h(source.id)}</strong><br>${h(source.title)}</td><td>${h(source.locale_priority)}<br>${source.media_type === 'video' ? `${source.duration_seconds.toFixed(3)}초` : `${source.width}×${source.height}`}</td><td>${h(source.license)} · <a href="${h(source.license_url)}">조건</a><br><a href="${h(source.item_url)}">항목</a></td><td>${h(source.attribution)}</td><td><code>${source.sha256}</code></td></tr>`).join('\n');
const cutRows = coverage.map((cut) => `<tr><td>${cut.cut_id}</td><td>${(cut.estimated_frames / 30).toFixed(3)}초</td><td>${h(cut.production_mode)}</td><td class="${cut.coverage_status.startsWith('source-not-applicable') ? 'graphic' : 'ok'}">${h(cut.coverage_status)}</td><td>${cut.selected_segments.map((segment) => `${h(segment.source_id)} ${segment.kind === 'video-window' ? `${segment.start_seconds.toFixed(3)}–${segment.end_seconds.toFixed(3)}초` : `${(segment.frames / 30).toFixed(3)}초 hold`}`).join('<br>') || h(cut.blocker)}</td><td>${h(cut.visual_need)}</td></tr>`).join('\n');
const routeRows = rejectedPending.route_failures.map((item) => `<tr><td>${h(item.route)}</td><td>${h(item.result)}</td></tr>`).join('');
const artifactHtml = artifact ? `<video controls preload="metadata" src="${path.basename(artifact.path)}"></video><p>${summary.source_selected_cuts} real-context source cuts · ${summary.selected_segments} segments · ${artifact.duration_seconds.toFixed(3)}초 · 1920×1080 · 30fps · 무음 · SHA-256 <code>${artifact.sha256}</code></p>${contactSheet ? `<img src="${path.basename(contactSheet.path)}" alt="27-cut source selection contact sheet"><p>27컷 midpoint contact sheet · SHA-256 <code>${contactSheet.sha256}</code></p>` : ''}${segmentContactSheet ? `<img src="${path.basename(segmentContactSheet.path)}" alt="all 83 selected segments contact sheet"><p>현재 선택된 83개 세그먼트 전수 contact sheet · SHA-256 <code>${segmentContactSheet.sha256}</code></p>` : ''}${readabilityContactSheet ? `<img src="${path.basename(readabilityContactSheet.path)}" alt="360 by 203 readability samples"><p>대표 6컷 360×203 축소 가독성 샘플 · SHA-256 <code>${readabilityContactSheet.sha256}</code></p>` : ''}` : '<p>현재 EDL과 길이가 다른 이전 릴은 검수 authority에서 배제됐다. <code>node video/scripts/build-episode-001-full-script-source-selection.mjs --render</code>로 재생성한다.</p>';
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EP001 실사 source reel 3차 권리·의미 감사 v04</title><style>body{margin:28px auto;max-width:1600px;padding:0 20px;background:#f2f1ec;color:#18201d;font:15px/1.55 system-ui,sans-serif}section{background:white;border:1px solid #ccd2ce;padding:18px;margin:18px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d6dbd7;padding:8px;vertical-align:top;text-align:left}th{background:#e7ede8}video,img{max-width:100%;background:#111}code{word-break:break-all;color:#075a3f}.ok{color:#075a3f;font-weight:700}.graphic{color:#8a5800;font-weight:700}.gap{color:#a12614;font-weight:700}.metric{font-size:19px;font-weight:700}</style><main><h1>EP001 실사 source reel 3차 권리·의미 감사 v04</h1><p>승인 대본과 48컷 timing, Omni 14컷은 유지했다. 실사 27컷을 권리 확인 원본에 결속했고, 실사로 법적 기간 관계를 정확히 표현할 수 없는 SH045는 LAW-1972 근거에 결속한 일곱 번째 Remotion 계획 컷으로 전환했다. production authority와 source/cut PASS는 모두 false다.</p><section><h2>3차 권리·의미 감사 결과</h2><p class="metric">문서·타이핑 의미군 55.7% → ${summary.document_typing_workflow_share_percent.toFixed(1)}% · 최대 단일 원본 ${summary.maximum_single_source_share_percent.toFixed(1)}% · 평균 연속 구간 ${summary.average_contiguous_segment_seconds.toFixed(3)}초</p><p>법원 외관은 재판과 증거능력을 설명하는 SH034–035에만 남겼다. SH012, SH022–025, SH027, SH031–032, SH036–040은 검찰청·경찰기관·문서 전달·기록 관리 workflow로 바꿨다. SH003은 국회의사당 외관에서 서울고검·중앙지검 외관으로 이어지는 실제 화면 역할을 기록했다. SH025의 사진 hold는 모두 2초 이상이다.</p><p class="graphic"><strong>SH045 Remotion 계획:</strong> 1개월 기본기간, 검사가 정하는 별도기간, 법률상 연장이라는 결합 관계는 실사 적용 불가로 판정했다. LAW-1972 전사에 결속한 래스터 없는 기간 계층으로만 설계하며, reference/style/playable-parity와 사용자 cut PASS 전에는 production-visible 화면을 만들지 않는다.</p></section><section><h2>27컷 real-context source reel</h2>${artifactHtml}<p>모든 세그먼트에 컷 ID, 고정 대본 발췌, source 제목·creator·license와 정확 영상 timecode/사진 hold를 표시한다. Omni keyframe-input 대기 14컷과 Remotion 7컷은 placeholder 없이 제외했다. 전체 대본 558.667초 중 source reel은 ${edl.source_reel_seconds.toFixed(3)}초다.</p></section><section><h2>권리 확인 원본 ${inventory.length}개</h2><p>한국 기관 자료를 우선하고, 한국 자유 라이선스 원본이 없던 중립 문서 workflow에만 Commons 범용 실사를 썼다. 원본 음원은 제거했다. 결합 adaptation은 CC BY-SA 4.0으로 공유하며 attribution·license URL·변경 표시를 유지한다.</p><table><thead><tr><th>source</th><th>우선순위·기술</th><th>권리</th><th>확대 출처표시</th><th>SHA-256</th></tr></thead><tbody>${sourceRows}</tbody></table></section><section><h2>48컷 coverage</h2><table><thead><tr><th>컷</th><th>길이</th><th>mode</th><th>상태</th><th>exact source/time 또는 blocker</th><th>대본 화면 역할</th></tr></thead><tbody>${cutRows}</tbody></table></section><section><h2>route 결과와 배제</h2><table><thead><tr><th>route</th><th>결과</th></tr></thead><tbody>${routeRows}</tbody></table><p>기존 후보 판정은 <a href="../../../source-intake/episode-001/full-script-usable-v01/rejected-pending-ledger.json">rejected/pending ledger</a>에 기록했다. 관광 몽타주, 크리스마스 야경, 가상 사건용 generic 실사는 선정 inventory에서 제거했다.</p></section><section><h2>검수 파일</h2><ul><li><a href="../../../source-intake/episode-001/full-script-usable-v01/coverage-matrix.json">coverage matrix</a></li><li><a href="../../../source-intake/episode-001/full-script-usable-v01/rights-inventory.json">rights inventory</a></li><li><a href="../../../source-intake/episode-001/full-script-usable-v01/source-selection-edl.json">source-selection EDL</a></li><li><a href="segment-contact-sheet.jpg">83-segment contact sheet</a></li><li><a href="readability-360x203-contact.jpg">360×203 readability samples</a></li></ul></section></main></html>`;
fs.writeFileSync(path.join(reviewRoot, 'review.html'), html);
fs.writeFileSync(path.join(reviewRoot, 'manifest.json'), `${JSON.stringify({schema_version: 1, candidate_id: 'episode-001-full-script-usable-v01', generated_at: new Date().toISOString(), review_profile: 'source-video-selection', production_authority: false, user_source_pass: false, user_cut_pass: false, active_cut_root: null, episode_spec_sha256: expectedSpecSha256, inventory_sha256: sha256(path.join(candidateRoot, 'rights-inventory.json')), coverage_sha256: sha256(path.join(candidateRoot, 'coverage-matrix.json')), edl_sha256: sha256(path.join(candidateRoot, 'source-selection-edl.json')), rejected_pending_sha256: sha256(path.join(candidateRoot, 'rejected-pending-ledger.json')), artifact, contact_sheet: contactSheet, segment_contact_sheet: segmentContactSheet, readability_contact_sheet: readabilityContactSheet}, null, 2)}\n`);
fs.writeFileSync(path.join(reviewRoot, 'README.md'), `# EP001 source-selection third rights-semantics audit v04\n\n- [검토 페이지](review.html)\n- [review manifest](manifest.json)\n- [27-cut contact sheet](contact-sheet.jpg)\n- [83-segment contact sheet](segment-contact-sheet.jpg)\n- [360×203 samples](readability-360x203-contact.jpg)\n- [coverage matrix](../../../source-intake/episode-001/full-script-usable-v01/coverage-matrix.json)\n- [rights inventory](../../../source-intake/episode-001/full-script-usable-v01/rights-inventory.json)\n\n실사 27컷을 권리 확인 원본에 배정했다. SH045는 정확한 기간 관계를 실사로 표현할 수 없어 LAW-1972 근거 결속 Remotion 계획으로 전환했다. 가상 사건 14컷은 Omni keyframe-input 대기, 법률 관계 7컷은 Remotion 대기다. production authority, source PASS, cut PASS는 부여하지 않는다.\n`);
console.log(JSON.stringify({summary, artifact, review: rel(path.join(reviewRoot, 'review.html')), manifest: rel(path.join(reviewRoot, 'manifest.json'))}, null, 2));
