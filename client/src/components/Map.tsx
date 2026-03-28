import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Pin } from "../types";
import { PinPopup } from "./PinPopup";

import "leaflet/dist/leaflet.css";

function createPinIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="custom-pin"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function createClusterIcon(cluster: { getChildCount(): number }) {
  const count = cluster.getChildCount();
  let size = "small";
  if (count >= 20) size = "large";
  else if (count >= 8) size = "medium";
  return L.divIcon({
    html: `<div>${count}</div>`,
    className: `marker-cluster marker-cluster-${size}`,
    iconSize: [48, 48],
  });
}

interface ClickHandlerProps {
  placingMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
}

function ClickHandler({ placingMode, onMapClick }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (placingMode) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

interface MapViewProps {
  pins: Pin[];
  placingMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
}

export function MapView({ pins, placingMode, onMapClick }: MapViewProps) {
  const icon = createPinIcon();

  return (
    <MapContainer
      center={[48, 40]}
      zoom={4}
      zoomControl={true}
      attributionControl={false}
      className={placingMode ? "placing-mode" : ""}
      style={{ width: "100%", height: "100vh" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={18}
      />
      <ClickHandler placingMode={placingMode} onMapClick={onMapClick} />
      <MarkerClusterGroup
        maxClusterRadius={50}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
        zoomToBoundsOnClick={true}
        iconCreateFunction={createClusterIcon}
      >
        {pins.map((pin) => (
          <Marker key={pin._id} position={[pin.lat, pin.lng]} icon={icon}>
            <Popup closeButton={false}>
              <PinPopup pin={pin} />
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
