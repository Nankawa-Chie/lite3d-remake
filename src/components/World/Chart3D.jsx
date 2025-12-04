import React, {useRef, useEffect, useState, useMemo} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {Html} from "@react-three/drei";
import * as THREE from "three";
import {SVGLoader} from "three/examples/jsm/loaders/SVGLoader.js";
import Chart from "chart.js/auto";

/**
 * @description MC护甲伤害抵消机制3D图表组件
 * 将Chart.js图表渲染到3D空间中的平面上，支持交互操作
 * @param {object} props - 组件属性
 * @param {Array} props.position - 3D空间中的位置 [x, y, z]
 * @param {Array} props.scale - 缩放比例 [x, y, z] 或单个数值
 * @param {Array} props.rotation - 旋转角度 [x, y, z]
 * @returns {JSX.Element}
 */
function Chart3D({position = [0, 0, 0], scale = 1, rotation = [0, 0, 0]}) {
  // Three.js相关引用
  const meshRef = useRef();
  const canvasRef = useRef();
  const textureRef = useRef();
  const materialRef = useRef();
  const {camera, raycaster, scene} = useThree();

  // Chart.js实例和状态
  const [chartInstance, setChartInstance] = useState(null);
  // Ref to hold the current Chart.js instance to avoid stale closures
  const chartRef = useRef(null);
  const chartDestroyedRef = useRef(false);
  // Track pending timeouts to cancel on unmount
  const timeoutsRef = useRef([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [materialReady, setMaterialReady] = useState(false);

  // 鼠标交互状态
  const mouseRef = useRef(new THREE.Vector2());
  const [hoveredButton, setHoveredButton] = useState(null);

  // 图表悬停状态
  const [isHoveringChart, setIsHoveringChart] = useState(false);

  // SVG按钮状态
  const [svgButtons, setSvgButtons] = useState({});
  const svgButtonsRef = useRef({});

  // 图表逻辑状态
  const [chartState, setChartState] = useState({
    baseArmorSets: [],
    customArmorSets: [],
    damageRange: 85,
    isPercentage: false,
    nextId: 0,
  });

  // 护甲计算逻辑
  const calculateDamage = useMemo(() => {
    return (v, t, d, epf = 0) => {
      const armorReduction = Math.min(20, Math.max(0.2 * v, v - d / (2 + 0.25 * t))) / 25;
      const damageAfterArmor = d * (1 - armorReduction);
      const enchantReduction = Math.min(0.8, epf / 25);
      return damageAfterArmor * (1 - enchantReduction);
    };
  }, []);

  // 创建图表数据集
  const createChartDataset = useMemo(() => {
    return (set, data) => ({
      id: set.id,
      label: set.name,
      data: data,
      borderColor: set.color,
      backgroundColor: `${set.color}33`,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      fill: true,
    });
  }, []);

  // 初始化基础护甲套装数据
  useEffect(() => {
    const baseArmorSets = [
      {name: "Unarmored", v: 0, t: 0, epf: 0, color: "#FF4D4D"},
      {name: "Leather", v: 7, t: 0, epf: 0, color: "#D2B48C"},
      {name: "Gold", v: 11, t: 0, epf: 0, color: "#F1C40F"},
      {name: "Iron", v: 15, t: 0, epf: 0, color: "#BDC3C7"},
      {name: "Diamond", v: 20, t: 8, epf: 0, color: "#3498DB"},
      {name: "Netherite", v: 20, t: 12, epf: 0, color: "#9B59B6"},
      {name: "Prot IV Netherite", v: 20, t: 12, epf: 16, color: "#00A3FF"},
    ].map((set, index) => ({...set, id: index, isCustom: false}));

    setChartState((prev) => ({
      ...prev,
      baseArmorSets,
      nextId: baseArmorSets.length,
    }));
  }, []);

  // 初始化Canvas和Chart.js
  useEffect(() => {
    // 创建Canvas元素（不通过JSX）
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 568;
    canvas.style.position = "absolute";
    canvas.style.top = "-9999px";
    canvas.style.left = "-9999px";
    canvas.style.pointerEvents = "none";
    document.body.appendChild(canvas);

    canvasRef.current = canvas;

    // 创建THREE.CanvasTexture
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = true; // 修复上下颠倒问题
    textureRef.current = texture;

    // 创建稳定的材质引用
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    materialRef.current = material;
    setMaterialReady(true);

    const ctx = canvas.getContext("2d");

    // 创建Chart.js实例
    // Reset destruction flag on mount to allow recreation after unmounts
    chartDestroyedRef.current = false;
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [],
      },
      options: {
        animation: {
          onProgress: () => updateTexture(),
          onComplete: () => updateTexture(),
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {color: "#FFF"},
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label || "";
                const value = ctx.parsed.y;
                const rawDamage = chart.data.labels[ctx.dataIndex];
                // 从图表实例的options中获取当前状态
                const isPercentageMode = chart.options.scales.y.title.text.includes("%");
                const reduction = rawDamage > 0 ? (1 - (isPercentageMode ? value / 100 : value / rawDamage)) * 100 : 0;
                if (rawDamage > 0) {
                  return `${label}: ${value.toFixed(2)}${isPercentageMode ? "%" : ""} (${reduction.toFixed(1)}% reduction)`;
                }
                return `${label}: ${value.toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {display: true, text: "Raw Damage (d)", color: "#AAA"},
            ticks: {color: "#FFF"},
            grid: {color: "#444"},
          },
          y: {
            title: {display: true, text: "Effective Damage (D)", color: "#AAA"},
            ticks: {color: "#FFF"},
            grid: {color: "#444"},
          },
        },
        responsive: false,
        maintainAspectRatio: false,
      },
    });

    // Force an initial draw and texture update to ensure visibility
    chart.update();
    updateTexture();

    chartRef.current = chart;
    setChartInstance(chart);

    return () => {
      chartDestroyedRef.current = true;
      // 清理tooltip状态
      if (chart && chart.tooltip) {
        chart.tooltip.setActiveElements([], {x: 0, y: 0});
      }
      // cancel any pending timeouts that might call Chart.js after destroy
      timeoutsRef.current.forEach((id)=> clearTimeout(id));
      timeoutsRef.current = [];
      setChartInstance(null);
      chartRef.current = null;
      chart.destroy();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      // 清理材质和纹理
      if (materialRef.current) {
        materialRef.current.dispose();
      }
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, []);

  // 更新纹理
  const updateTexture = () => {
    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    }
  };

  /**
   * @description 创建SVG按钮的3D几何体
   * @param {string} svgPath - SVG文件路径
   * @param {string} buttonName - 按钮名称
   * @param {THREE.Vector3} position - 按钮位置
   * @param {number} targetSize - 目标尺寸
   * @returns {Promise<THREE.Group>} SVG按钮组
   */
  const createSVGButton = useMemo(() => {
    return (svgPath, buttonName, position, targetSize = 0.8) => {
      return new Promise((resolve, reject) => {
        const svgLoader = new SVGLoader();

        svgLoader.load(
          svgPath,
          (data) => {
            const group = new THREE.Group();
            group.name = buttonName;
            group.position.copy(position);

            // 获取SVG的viewBox来计算缩放
            const viewBox = data.xml.getAttribute("viewBox");
            let scale = targetSize / 100; // 默认缩放

            if (viewBox) {
              const viewBoxValues = viewBox.split(" ").map(Number);
              const maxDimension = Math.max(viewBoxValues[2], viewBoxValues[3]);
              scale = targetSize / maxDimension;
            }

            group.scale.set(scale, -scale, scale); // Y轴翻转

            // 创建材质
            const originalButtonColor = new THREE.Color(0x00a3ff);
            const baseMaterial = new THREE.MeshStandardMaterial({
              color: originalButtonColor,
              metalness: 0.8,
              roughness: 0.4,
            });

            // 处理SVG路径
            for (const path of data.paths) {
              const material = baseMaterial.clone();
              path.userData.material = material;
              const shapes = SVGLoader.createShapes(path);

              for (const shape of shapes) {
                const geometry = new THREE.ExtrudeGeometry(shape, {
                  depth: 2.4, // 挤出深度
                  bevelEnabled: false,
                });
                const mesh = new THREE.Mesh(geometry, material);
                group.add(mesh);
              }
            }

            // 居中对齐
            const box = new THREE.Box3().setFromObject(group);
            const center = box.getCenter(new THREE.Vector3());
            group.children.forEach((child) => child.position.sub(center));

            resolve(group);
          },
          undefined,
          (error) => {
            console.warn(`Failed to load SVG: ${svgPath}`, error);
            // 创建一个简单的立方体作为后备
            const fallbackGeometry = new THREE.BoxGeometry(targetSize, targetSize, 0.1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({
              color: 0x00a3ff,
              metalness: 0.8,
              roughness: 0.4,
            });
            const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackMesh.position.copy(position);
            fallbackMesh.name = buttonName;
            resolve(fallbackMesh);
          }
        );
      });
    };
  }, []);

  // 更新现有数据集的数值（用于切换和范围调整，保留动画）
  const updateChartValues = () => {
    const chart = chartRef.current;
    if (!chart || chartDestroyedRef.current) return;

    const yAxis = chart.options.scales.y;
    yAxis.title.text = chartState.isPercentage ? "Damage Taken (%)" : "Effective Damage (D)";
    const newLabels = Array.from({length: chartState.damageRange}, (_, i) => i + 1);
    chart.data.labels = newLabels;

    chart.data.datasets.forEach((dataset) => {
      const allSets = [...chartState.baseArmorSets, ...chartState.customArmorSets];
      const set = allSets.find((s) => s.id === dataset.id);
      if (set) {
        const damageData = newLabels.map((d) => {
          const finalDamage = calculateDamage(set.v, set.t, d, set.epf);
          return chartState.isPercentage && d > 0 ? (finalDamage / d) * 100 : finalDamage;
        });
        dataset.data = damageData;
      }
    });
    chart.update();
    updateTexture();
  };

  // 重建整个数据集（用于添加和删除）
  const rebuildChartDatasets = () => {
    const chart = chartRef.current;
    if (!chart || chartDestroyedRef.current) return;

    const allSets = [...chartState.baseArmorSets, ...chartState.customArmorSets];
    const newLabels = Array.from({length: chartState.damageRange}, (_, i) => i + 1);
    chart.data.labels = newLabels;

    // 更新Y轴标题以保持当前模式
    chart.options.scales.y.title.text = chartState.isPercentage ? "Damage Taken (%)" : "Effective Damage (D)";

    chart.data.datasets = allSets.map((set) => {
      const damageData = newLabels.map((d) => {
        const finalDamage = calculateDamage(set.v, set.t, d, set.epf);
        // 根据当前模式决定是否转换为百分比
        return chartState.isPercentage && d > 0 ? (finalDamage / d) * 100 : finalDamage;
      });
      return createChartDataset(set, damageData);
    });
    chart.update();
    updateTexture();
  };

  // 当图表状态改变时更新图表
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chartDestroyedRef.current) return;

    // 初始化时重建数据集
    if (chartState.baseArmorSets.length > 0) {
      rebuildChartDatasets();
    }
  }, [chartInstance, chartState.baseArmorSets, chartState.customArmorSets]);

  // 初始化SVG按钮
  useEffect(() => {
    const initSVGButtons = async () => {
      const buttonConfigs = [
        {name: "rangeDown", path: "/src/assets/icons/minus.svg", position: new THREE.Vector3(-4.6, 1.5, 0)},
        {name: "rangeUp", path: "/src/assets/icons/plus.svg", position: new THREE.Vector3(-2.4, 1.5, 0)},
        {name: "toggle", path: "/src/assets/icons/toggle.svg", position: new THREE.Vector3(-0.2, 1.5, 0)},
        {name: "add", path: "/src/assets/icons/add.svg", position: new THREE.Vector3(2, 1.5, 0)},
        {name: "delete", path: "/src/assets/icons/delete.svg", position: new THREE.Vector3(4.2, 1.5, 0)},
      ];

      const buttons = {};

      for (const config of buttonConfigs) {
        try {
          const button = await createSVGButton(config.path, config.name, config.position);
          buttons[config.name] = button;
          svgButtonsRef.current[config.name] = button;
        } catch (error) {
          console.warn(`Failed to create SVG button ${config.name}:`, error);
        }
      }

      setSvgButtons(buttons);
    };

    initSVGButtons();

    // Cleanup: dispose previous buttons and clear refs/state on unmount
    return () => {
      Object.values(svgButtonsRef.current).forEach((btn) => {
        try {
          btn.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
              else obj.material.dispose();
            }
          });
        } catch (e) {
          // ignore
        }
      });
      svgButtonsRef.current = {};
      setSvgButtons({});
    };
  }, [createSVGButton]);

  // 监听chartState变化，更新删除按钮状态
  useEffect(() => {
    const hasCustomArmor = chartState.customArmorSets.length > 0;
    updateSVGButtonColor("delete", hasCustomArmor ? "normal" : "disabled");
  }, [chartState.customArmorSets.length]);

  // 添加自定义护甲套装
  const addCustomArmor = (armorData) => {
    setChartState((prev) => ({
      ...prev,
      customArmorSets: [
        ...prev.customArmorSets,
        {
          ...armorData,
          id: prev.nextId,
          isCustom: true,
        },
      ],
      nextId: prev.nextId + 1,
    }));
  };

  // 清除自定义护甲套装
  const clearCustomArmor = () => {
    setChartState((prev) => ({
      ...prev,
      customArmorSets: [],
    }));
  };

  // 切换百分比模式
  const togglePercentageMode = () => {
    setChartState((prev) => {
      const newState = {
        ...prev,
        isPercentage: !prev.isPercentage,
      };

      // 立即更新图表值，避免重建数据集
      if (chartRef.current) {
        const scheduledChart = chartRef.current;
        const id = setTimeout(() => {
          const chart = chartRef.current;
          if (!chart || chartDestroyedRef.current || chart !== scheduledChart) return;
          const yAxis = chart.options.scales.y;
          yAxis.title.text = newState.isPercentage ? "Damage Taken (%)" : "Effective Damage (D)";

          chartInstance.data.datasets.forEach((dataset) => {
            const allSets = [...newState.baseArmorSets, ...newState.customArmorSets];
            const set = allSets.find((s) => s.id === dataset.id);
            if (set) {
              const labels = Array.from({length: newState.damageRange}, (_, i) => i + 1);
              const damageData = labels.map((d) => {
                const finalDamage = calculateDamage(set.v, set.t, d, set.epf);
                return newState.isPercentage && d > 0 ? (finalDamage / d) * 100 : finalDamage;
              });
              dataset.data = damageData;
            }
          });
          chartInstance.update();
          updateTexture();
        }, 0);
        timeoutsRef.current.push(id);
      }

      return newState;
    });
  };

  // 更新伤害范围
  const updateRange = (amount) => {
    setChartState((prev) => {
      const newState = {
        ...prev,
        damageRange: Math.max(10, Math.min(500, prev.damageRange + amount)),
      };

      // 立即更新图表值，避免重建数据集
      if (chartInstance) {
        const id = setTimeout(() => {
          if (!chartInstance || chartDestroyedRef.current) return;
          const newLabels = Array.from({length: newState.damageRange}, (_, i) => i + 1);
          chartInstance.data.labels = newLabels;

          chartInstance.data.datasets.forEach((dataset) => {
            const allSets = [...newState.baseArmorSets, ...newState.customArmorSets];
            const set = allSets.find((s) => s.id === dataset.id);
            if (set) {
              const damageData = newLabels.map((d) => {
                const finalDamage = calculateDamage(set.v, set.t, d, set.epf);
                return newState.isPercentage && d > 0 ? (finalDamage / d) * 100 : finalDamage;
              });
              dataset.data = damageData;
            }
          });
          chartInstance.update();
          updateTexture();
        }, 0);
        timeoutsRef.current.push(id);
      }

      return newState;
    });
  };

  /**
   * @description 更新SVG按钮的颜色状态
   * @param {string} buttonName - 按钮名称
   * @param {string} colorType - 颜色类型 ('normal', 'hover', 'disabled')
   */
  const updateSVGButtonColor = (buttonName, colorType) => {
    const button = svgButtonsRef.current[buttonName];
    if (!button) return;

    const colors = {
      normal: new THREE.Color(0x00a3ff),
      hover: new THREE.Color(0xffffff),
      disabled: new THREE.Color(0x555555),
    };

    const metalness = {
      normal: 0.8,
      hover: 0.8,
      disabled: 0.2,
    };

    const roughness = {
      normal: 0.4,
      hover: 0.4,
      disabled: 0.8,
    };

    button.children.forEach((child) => {
      if (child.material) {
        child.material.color.copy(colors[colorType]);
        child.material.metalness = metalness[colorType];
        child.material.roughness = roughness[colorType];
      }
    });
  };

  // 处理按钮点击
  const handleButtonClick = (buttonType) => {
    switch (buttonType) {
      case "rangeDown":
        updateRange(-10);
        break;
      case "rangeUp":
        updateRange(10);
        break;
      case "toggle":
        togglePercentageMode();
        break;
      case "add":
        setIsModalOpen(true);
        break;
      case "delete":
        if (chartState.customArmorSets.length > 0) {
          clearCustomArmor();
        }
        break;
    }
  };

  // 处理表单提交
  const handleFormSubmit = (formData) => {
    addCustomArmor({
      name: formData.name,
      v: parseFloat(formData.v),
      t: parseFloat(formData.t),
      epf: parseFloat(formData.epf),
      color: formData.color,
    });
    setIsModalOpen(false);
  };

  /**
   * @description 处理图表平面的鼠标悬停事件
   * @param {object} event - 鼠标事件对象
   */
  const handleChartHover = (event) => {
    if (!chartInstance || !canvasRef.current) return;

    // 获取交点的UV坐标
    const uv = event.uv;
    if (!uv) return;

    // 将UV坐标转换为Canvas坐标
    const canvasX = uv.x * canvasRef.current.width;
    const canvasY = (1 - uv.y) * canvasRef.current.height; // 翻转Y轴

    // 获取该位置的图表元素
    const elements = chartInstance.getElementsAtEventForMode(
      {offsetX: canvasX, offsetY: canvasY},
      "nearest",
      {intersect: true},
      true
    );

    // 设置活动元素以显示tooltip
    chartInstance.tooltip.setActiveElements(elements.length ? elements : [], {x: canvasX, y: canvasY});

    // 更新图表以显示tooltip
    chartInstance.update("none");
    setIsHoveringChart(true);
  };

  /**
   * @description 处理鼠标离开图表平面的事件
   */
  const handleChartLeave = () => {
    if (!chartInstance) return;

    // 清除tooltip
    chartInstance.tooltip.setActiveElements([], {x: 0, y: 0});
    chartInstance.update("none");
    setIsHoveringChart(false);
  };

  return (
    <group position={position} scale={scale} rotation={rotation}>
      {/* 3D平面显示图表 */}
      {materialReady && materialRef.current && (
        <mesh ref={meshRef} material={materialRef.current} onPointerMove={handleChartHover} onPointerLeave={handleChartLeave}>
          <planeGeometry args={[10.24, 5.68]} />
        </mesh>
      )}

      {/* SVG控制按钮 */}
      <group position={[0, -4.5, 0.1]}>
        {Object.entries(svgButtons).map(([buttonName, buttonGroup]) => {
          const isDeleteButton = buttonName === "delete";
          const isEnabled = !isDeleteButton || chartState.customArmorSets.length > 0;

          return (
            <group
              key={buttonName}
              onClick={() => isEnabled && handleButtonClick(buttonName)}
              onPointerOver={() => {
                if (isEnabled) {
                  setHoveredButton(buttonName);
                  updateSVGButtonColor(buttonName, "hover");
                }
              }}
              onPointerOut={() => {
                setHoveredButton(null);
                updateSVGButtonColor(buttonName, isEnabled ? "normal" : "disabled");
              }}
            >
              <primitive object={buttonGroup} />
            </group>
          );
        })}
      </group>

      {/* 模态框 - 使用Html组件在屏幕空间渲染 */}
      {isModalOpen && (
        <Html
          center
          distanceFactor={10}
          position={[0, 0, 1]}
          style={{
            pointerEvents: "auto",
            userSelect: "auto",
          }}
        >
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(5px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "480px",
                backgroundColor: "#131315",
                border: "1px solid #2a2a2d",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "1.5rem",
                  borderBottom: "1px solid #2a2a2d",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.2rem",
                    color: "#eaeaeb",
                  }}
                >
                  Add New Configuration
                </h3>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  handleFormSubmit({
                    name: formData.get("name"),
                    v: formData.get("v"),
                    t: formData.get("t"),
                    epf: formData.get("epf"),
                    color: formData.get("color"),
                  });
                }}
                style={{
                  padding: "1.5rem",
                  display: "grid",
                  gap: "1rem",
                }}
              >
                <div style={{display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "1rem"}}>
                  <label style={{fontSize: "0.9rem", color: "#88888f"}}>Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={`Custom Set ${chartState.customArmorSets.length + 1}`}
                    required
                    style={{
                      fontFamily: "inherit",
                      fontSize: "1rem",
                      backgroundColor: "#0a0a0b",
                      border: "1px solid #2a2a2d",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      color: "#eaeaeb",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "1rem"}}>
                  <label style={{fontSize: "0.9rem", color: "#88888f"}}>Armor (v)</label>
                  <input
                    type="number"
                    name="v"
                    defaultValue="25"
                    min="0"
                    required
                    style={{
                      fontFamily: "inherit",
                      fontSize: "1rem",
                      backgroundColor: "#0a0a0b",
                      border: "1px solid #2a2a2d",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      color: "#eaeaeb",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "1rem"}}>
                  <label style={{fontSize: "0.9rem", color: "#88888f"}}>Toughness (t)</label>
                  <input
                    type="number"
                    name="t"
                    defaultValue="15"
                    min="0"
                    required
                    style={{
                      fontFamily: "inherit",
                      fontSize: "1rem",
                      backgroundColor: "#0a0a0b",
                      border: "1px solid #2a2a2d",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      color: "#eaeaeb",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "1rem"}}>
                  <label style={{fontSize: "0.9rem", color: "#88888f"}}>EPF</label>
                  <input
                    type="number"
                    name="epf"
                    defaultValue="20"
                    min="0"
                    required
                    style={{
                      fontFamily: "inherit",
                      fontSize: "1rem",
                      backgroundColor: "#0a0a0b",
                      border: "1px solid #2a2a2d",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      color: "#eaeaeb",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: "1rem"}}>
                  <label style={{fontSize: "0.9rem", color: "#88888f"}}>Color</label>
                  <input
                    type="color"
                    name="color"
                    defaultValue="#E67E22"
                    style={{
                      fontFamily: "inherit",
                      fontSize: "1rem",
                      backgroundColor: "#0a0a0b",
                      border: "1px solid #2a2a2d",
                      borderRadius: "6px",
                      padding: "0.75rem",
                      color: "#eaeaeb",
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "1.5rem 0 0 0",
                    borderTop: "1px solid #2a2a2d",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "1rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    style={{
                      backgroundColor: "#21262d",
                      border: "1px solid #2a2a2d",
                      color: "#eaeaeb",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "6px",
                      fontSize: "0.9rem",
                      fontWeight: "500",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      backgroundColor: "#00a3ff",
                      border: "1px solid #00a3ff",
                      color: "#131315",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "6px",
                      fontSize: "0.9rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Add Configuration
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default Chart3D;
