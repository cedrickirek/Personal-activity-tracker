// The app's icon, drawn in code so there's no image file to maintain:
// a clock face (dark circle, two hands) on a dark rounded square. Used by
// icon.tsx (browser tab, Android) and apple-icon.tsx (iPhone home screen).

export function AppIcon({ size }: { size: number }) {
  const unit = size / 100;
  const hand = (length: number, angle: number) => (
    <div
      style={{
        position: "absolute",
        left: 50 * unit - 3 * unit,
        top: 50 * unit - length * unit,
        width: 6 * unit,
        height: length * unit,
        borderRadius: 3 * unit,
        background: "#fafafa",
        transformOrigin: "50% 100%",
        transform: `rotate(${angle}deg)`,
      }}
    />
  );
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#18181b",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 18 * unit,
          top: 18 * unit,
          width: 64 * unit,
          height: 64 * unit,
          borderRadius: "50%",
          border: `${6 * unit}px solid #fafafa`,
        }}
      />
      {hand(24, 0)}
      {hand(18, 120)}
    </div>
  );
}
