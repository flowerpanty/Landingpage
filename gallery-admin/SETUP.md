# RECENTLY MADE gallery setup

1. Railway Variables에 `GALLERY_ADMIN_TOKEN`을 추가합니다.
2. Railway Volume을 `/data` 경로에 연결합니다.
3. Railway Variables에 `GALLERY_DATA_DIR=/data/nothingmatters-gallery`를 추가합니다.
4. 재배포 후 `https://nothingmatters.co.kr/gallery-admin/`에서 관리자 키와 사진을 입력합니다.

Volume을 연결하지 않으면 사진은 다음 재배포 또는 컨테이너 재시작 때 사라질 수 있습니다.

## 사진 올리는 방법

1. `https://nothingmatters.co.kr/gallery-admin/`에 접속합니다.
2. Railway에 등록한 `GALLERY_ADMIN_TOKEN` 값을 관리자 키에 입력합니다.
3. 사진을 선택하고 홈에 표시할 짧은 설명을 적습니다.
4. 제품 상세페이지로 연결하려면 주소를 입력하고, 필요 없으면 비워둡니다.
5. `사진 올리기`를 누르면 홈 `RECENTLY MADE` 첫 번째에 표시됩니다.

직접 올린 사진이 한 장 이상 있으면 기본 예시 사진은 숨겨지고 업로드한 사진만 표시됩니다. 삭제는 같은 관리 화면의 `내가 올린 사진`에서 할 수 있습니다.
