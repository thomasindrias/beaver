export default function App() {
  const route = window.location.pathname;

  if (route === "/capture") {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "rgba(0,0,0,0.3)" }}>
        {/* Capture overlay — implemented in Task 6 */}
      </div>
    );
  }

  return null;
}
