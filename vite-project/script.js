// 1. 地図の初期化
const map = L.map('map').setView([35.0116, 135.7681], 13); 
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let myLatLng = null;
let userMarker = null;
let routingControl = null;

// 現在地用カスタムアイコン
const locationIcon = L.divIcon({
    className: 'current-location-icon',
    html: `
        <div class="pulse"></div>
        <div class="direction-beam" id="user-beam"></div>
        <div class="user-dot"></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

// 2. 現在地をリアルタイム取得
if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        myLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
        
        if (!userMarker) {
            userMarker = L.marker(myLatLng, { icon: locationIcon }).addTo(map).bindPopup("現在地");
            map.setView(myLatLng, 15);
        } else {
            userMarker.setLatLng(myLatLng);
        }
    }, (err) => console.warn(err), { enableHighAccuracy: true });
}

// 3. ルート表示
function setDestinationAndRoute(latlng) {
    document.getElementById('dest-info').textContent = 
        `緯度: ${latlng.lat.toFixed(5)}, 経度: ${latlng.lng.toFixed(5)}`;

    if (myLatLng) {
        if (routingControl) { map.removeControl(routingControl); }
        routingControl = L.Routing.control({
            waypoints: [myLatLng, latlng],
            language: 'ja',
            lineOptions: { styles: [{color: '#007AFF', weight: 6, opacity: 0.7}] },
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' })
        }).addTo(map);
    }
}

// 4. コンパス（向き）制御
const orientBtn = document.getElementById('orient-btn');
if (orientBtn) {
    orientBtn.addEventListener('click', () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation);
                        orientBtn.style.display = 'none';
                    }
                });
        } else {
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            orientBtn.style.display = 'none';
        }
    });
}

function handleOrientation(event) {
    let alpha = event.webkitCompassHeading || event.alpha; 
    const beam = document.getElementById('user-beam');
    if (alpha !== null && beam) {
        beam.style.display = 'block';
        beam.style.transform = `rotate(${alpha}deg)`;
    }
}

// 5. 地図クリック & 検索
map.on('click', (e) => setDestinationAndRoute(e.latlng));

if (L.Control.geocoder) {
    L.Control.geocoder({ defaultMarkGeocode: false, placeholder: "場所を検索..." })
        .on('markgeocode', (e) => {
            setDestinationAndRoute(e.geocode.center);
            map.setView(e.geocode.center, 15);
        }).addTo(map);
}

// 6. JSONファイルをフェッチして表示
// サーバー（Live Server等）経由で実行する必要があります
fetch('./kyoto_crime.json')
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(crimeData => {
        L.geoJSON(crimeData, {
            onEachFeature: (feature, layer) => {
                // ポップアップに情報を表示（必要に応じて）
                if (feature.properties) {
                    const props = feature.properties;
                    let popupContent = `<b>犯罪種別:</b> ${props['罪名'] || '不明'}`;
                    if (props['手口']) {
                        popupContent += `<br><b>手口:</b> ${props['手口']}`;
                    }
                    if (props['発生年月日（始期）']) {
                        popupContent += `<br><b>発生日時:</b> ${props['発生年月日（始期）']} ${props['発生時（始期）'] ? props['発生時（始期）'] + '時頃' : ''}`;
                    }
                    layer.bindPopup(popupContent);
                }
                
                layer.on('click', (e) => {
                    // Leafletのイベントオブジェクトから直接座標を取得
                    setDestinationAndRoute(e.latlng);
                    // クリックした地点が目的地として認識されるよう伝搬を止める
                    L.DomEvent.stopPropagation(e);
                });
            }
        }).addTo(map);
    })
    .catch(error => {
        console.error('JSONの読み込み中にエラーが発生しました:', error);
    });

    // 7. 危険エリアデータの読み込みと可視化
fetch('./danger_areas.geojson')
    .then(response => {
        if (!response.ok) throw new Error('danger_areas.geojson の読み込みに失敗しました');
        return response.json();
    })
    .then(dangerData => {
        L.geoJSON(dangerData, {
            // 元のポリゴン自体は透明にする（中心に円を描くため）
            style: {
                color: "transparent",
                fillOpacity: 0
            },
            onEachFeature: (feature, layer) => {
                const score = feature.properties.risk_score || 0;
                
                // ポリゴンの中心座標を取得
                const center = layer.getBounds().getCenter();

                // スコアに基づいて円のスタイルを設定
                // スコアが 0.9 付近なので、半径を調整するために倍率（例: 15）を掛けます
                const circleOptions = {
                    radius: score * 15,          // スコアによって大きさを変える
                    fillColor: getDangerColor(score), // スコアによって色を変える
                    color: "#333",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.6
                };

                // 地図に円を追加
                const circle = L.circleMarker(center, circleOptions).addTo(map);

                // ポップアップの設定
                circle.bindPopup(`
                    <div style="text-align:center;">
                        <b>危険度エリア</b><br>
                        <span style="font-size:1.2em; color:red;">スコア: ${score.toFixed(4)}</span>
                    </div>
                `);

                // 円をクリックした時もルート検索の目的地にする場合
                circle.on('click', (e) => {
                    setDestinationAndRoute(e.latlng);
                    L.DomEvent.stopPropagation(e);
                });
            }
        }).addTo(map);
    })
    .catch(error => console.error('危険エリアデータの取得エラー:', error));

// 危険スコアに応じた色を返す関数（データの値に合わせて調整してください）
function getDangerColor(s) {
    return s > 0.945 ? '#800026' : // 非常に高い
           s > 0.943 ? '#BD0026' : // 高い
           s > 0.941 ? '#E31A1C' : // 中程度
                       '#FC4E2A';  // 低い（このデータ内での相対比較）
}