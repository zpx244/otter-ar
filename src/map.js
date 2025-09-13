import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 创建地图，设置中心位置为 Cork 城中心
const map = L.map('map').setView([51.899, -8.47], 14);

// 添加 OpenStreetMap 瓦片图层
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 自定义图标
const otterIcon = L.icon({
  iconUrl: '/assets/images/icon.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -35]
});

// 节点信息数组
const nodes = [
  { lat: 51.89830, lng: -8.49079, title: "Node 1 – Blackpool Headwaters", url: "/node1.html" },
  { lat: 51.898920, lng: -8.483751, title: "Node 2 – Path Choose", url: "/node2.html" },
  { lat: 51.901414, lng: -8.477903, title: "Node 3 – Feeding Scene", url: "/node3.html" },
  { lat: 51.900676, lng: -8.470667, title: "Node 4 – Trust Encounter", url: "/node4.html" },
  { lat: 51.900199, lng: -8.465996, title: "Node 5 – Obstacle Removal", url: "/node5.html" },
  { lat: 51.899299, lng: -8.459837, title: "Node 6 – Trash Avoidance", url: "/node6.html" },
  { lat: 51.898432, lng: -8.463226, title: "Node 7 – Noise Escape", url: "/node7.html" },
  { lat: 51.896565, lng: -8.468473, title: "Node 8 – Puzzle Rebuild", url: "/node8.html" },
  { lat: 51.895732, lng: -8.472196, title: "Node 9 – Eco Balance", url: "/node9.html" },
  { lat: 51.895329, lng: -8.477268, title: "Node 10 – Final Reflection", url: "/node10.html" }
];

// 添加图钉和 tooltip
nodes.forEach(({ lat, lng, title, url }) => {
  const marker = L.marker([lat, lng], { icon: otterIcon }).addTo(map);

  // 添加永久文字提示
  marker.bindTooltip(title, {
    permanent: true,
    direction: 'top',
    offset: [0, -40],
    className: 'node-tooltip'
  });

  // 点击跳转页面
  marker.on('click', () => {
    window.location.href = url;
  });
});

// 加载 Lee River 的 GeoJSON 数据并显示高亮样式
fetch('/assets/geo/lee-river.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: '#3399ff',
        weight: 5,
        opacity: 0.9,
        className: 'river-path'
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error('Failed to load river GeoJSON:', err);
  });