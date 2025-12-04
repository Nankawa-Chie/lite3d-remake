import {useState, useEffect} from "react";

/**
 * @name GameUI
 * @description 游戏的主UI层组件。
 * 它作为一个固定的覆盖层，用于容纳各种非WebGL的UI元素，例如手机界面。
 * 目前，它主要负责渲染一个可交互的 `<iframe>` 作为手机模拟器，
 * 并通过键盘事件来控制其显示和隐藏。
 *
 * @returns {React.ReactElement}
 */
function GameUI() {
  const [showPhone, setShowPhone] = useState(false);

  // Effect to listen for the 'Tab' key to toggle the phone's visibility
  useEffect(() => {
    const handleKeyPress = (event) => {
      // 將 "1" 改成 "Tab"
      if (event.key === "Tab") {
        // 阻止 Tab 鍵的預設行為 (切換焦點)
        event.preventDefault();

        setShowPhone((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    // Cleanup the event listener when the component unmounts
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none", // This container itself doesn't block mouse events...
        zIndex: 10,
      }}
    >
      {/* iPhone Container */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "-10px",
          width: "450px",
          height: "700px",
          // Use transform for smooth slide-in/out animation
          transform: showPhone ? "translateX(0)" : "translateX(450px)",
          transition: "transform 0.5s ease-in-out",
          pointerEvents: "auto", // ...but its children, like this one, can.
          zIndex: 20,
        }}
      >
        <iframe
          src="/iPhone12/index.html"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title="iPhone12 Simulator"
        />
      </div>
    </div>
  );
}

export default GameUI;
