// 1. 地図の初期化
const map = L.map('map').setView([35.0116, 135.7681], 13); 
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let myLatLng = null;
let userMarker = null;
let destinationMarker = null;
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

    if (destinationMarker) { map.removeLayer(destinationMarker); }
    destinationMarker = L.marker(latlng).addTo(map).bindPopup("目的地").openPopup();

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
                if (feature.properties && feature.properties.crime) {
                    layer.bindPopup(`犯罪種別: ${feature.properties.crime}`);
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