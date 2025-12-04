import React, {useMemo, useRef, useState, useCallback, useEffect} from "react";
import {useLoader, extend} from "@react-three/fiber";
import {RigidBody, CuboidCollider, BallCollider} from "@react-three/rapier";
import * as THREE from "three";
import {FontLoader} from "three/examples/jsm/loaders/FontLoader.js";
import {TextGeometry} from "three/examples/jsm/geometries/TextGeometry.js";
extend({TextGeometry});

/**
 * 足球场组件 - 复刻旧项目的足球场功能
 * @description 创建一个完整的足球场，包含场地、边界、球门、标记线和足球
 * @param {Object} props - 组件属性
 * @param {THREE.Vector3} props.position - 足球场位置，默认为 [-50, 0.02, 0]
 * @returns {JSX.Element} 足球场组件
 */
export default function SoccerField({position = [-50, 0.02, 0]}) {
  const ballTexture = useLoader(THREE.TextureLoader, "/assets/textures/soccer_ball.jpg");
  const matcapTexture = useLoader(THREE.TextureLoader, "/assets/textures/matcaps/8.png");
  const font = useLoader(FontLoader, "/assets/fonts/Sevillana_Regular.json");

  // 标准足球场尺寸（单位：米）
  const FIELD_WIDTH = 68;
  const FIELD_LENGTH = 105;
  const BOUNDARY_HEIGHT = 1.5;
  const BOUNDARY_THICKNESS = 0.1;

  // 球门尺寸
  const GOAL_WIDTH = 7.32;
  const GOAL_HEIGHT = 2.44;
  const GOAL_DEPTH = 2;
  const POST_THICKNESS = 0.12;

  // 场地标记尺寸
  const LINE_THICKNESS = 0.12;
  const PENALTY_AREA_WIDTH = 40.32;
  const PENALTY_AREA_LENGTH = 16.5;
  const GOAL_AREA_WIDTH = 18.32;
  const GOAL_AREA_LENGTH = 5.5;
  const CENTER_CIRCLE_RADIUS = 9.15;
  const CORNER_ARC_RADIUS = 1;
  const PENALTY_SPOT_DISTANCE = 11;
  const PENALTY_ARC_RADIUS = 9.15;

  // 足球半径
  const BALL_RADIUS = 0.22;

  const Boundaries = () => (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, FIELD_LENGTH / 2]}
          position={[-FIELD_WIDTH / 2 - BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, 0]}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, FIELD_LENGTH / 2]}
          position={[FIELD_WIDTH / 2 + BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, 0]}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[FIELD_WIDTH / 2, BOUNDARY_HEIGHT / 2, BOUNDARY_THICKNESS / 2]}
          position={[0, BOUNDARY_HEIGHT / 2, FIELD_LENGTH / 2 + BOUNDARY_THICKNESS / 2]}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[FIELD_WIDTH / 2, BOUNDARY_HEIGHT / 2, BOUNDARY_THICKNESS / 2]}
          position={[0, BOUNDARY_HEIGHT / 2, -FIELD_LENGTH / 2 - BOUNDARY_THICKNESS / 2]}
        />
      </RigidBody>
    </>
  );

  const createGoals = () => {
    const goals = [];
    const postMaterial = {color: 0xffffff, roughness: 0.4, metalness: 0.6};

    const createSingleGoal = (zPos, key) => {
      const zDirection = Math.sign(zPos);
      const backDepth = GOAL_DEPTH * zDirection * -1;
      return (
        <group key={key}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, GOAL_HEIGHT / 2, POST_THICKNESS / 2]}
              position={[-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, GOAL_HEIGHT / 2, POST_THICKNESS / 2]}
              position={[GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[(GOAL_WIDTH + POST_THICKNESS) / 2, POST_THICKNESS / 2, POST_THICKNESS / 2]}
              position={[0, GOAL_HEIGHT, zPos]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, GOAL_HEIGHT / 2, POST_THICKNESS / 2]}
              position={[-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos + backDepth]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, GOAL_HEIGHT / 2, POST_THICKNESS / 2]}
              position={[GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos + backDepth]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[(GOAL_WIDTH + POST_THICKNESS) / 2, POST_THICKNESS / 2, POST_THICKNESS / 2]}
              position={[0, GOAL_HEIGHT, zPos + backDepth]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, POST_THICKNESS / 2, GOAL_DEPTH / 2]}
              position={[-GOAL_WIDTH / 2, GOAL_HEIGHT, zPos + backDepth / 2]}
            />
          </RigidBody>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[POST_THICKNESS / 2, POST_THICKNESS / 2, GOAL_DEPTH / 2]}
              position={[GOAL_WIDTH / 2, GOAL_HEIGHT, zPos + backDepth / 2]}
            />
          </RigidBody>
          <mesh position={[-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos]} castShadow>
            <boxGeometry args={[POST_THICKNESS, GOAL_HEIGHT, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos]} castShadow>
            <boxGeometry args={[POST_THICKNESS, GOAL_HEIGHT, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[0, GOAL_HEIGHT, zPos]} castShadow>
            <boxGeometry args={[GOAL_WIDTH + POST_THICKNESS, POST_THICKNESS, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[-GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos + backDepth]} castShadow>
            <boxGeometry args={[POST_THICKNESS, GOAL_HEIGHT, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[GOAL_WIDTH / 2, GOAL_HEIGHT / 2, zPos + backDepth]} castShadow>
            <boxGeometry args={[POST_THICKNESS, GOAL_HEIGHT, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[0, GOAL_HEIGHT, zPos + backDepth]} castShadow>
            <boxGeometry args={[GOAL_WIDTH + POST_THICKNESS, POST_THICKNESS, POST_THICKNESS]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[-GOAL_WIDTH / 2, GOAL_HEIGHT, zPos + backDepth / 2]} castShadow>
            <boxGeometry args={[POST_THICKNESS, POST_THICKNESS, GOAL_DEPTH]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
          <mesh position={[GOAL_WIDTH / 2, GOAL_HEIGHT, zPos + backDepth / 2]} castShadow>
            <boxGeometry args={[POST_THICKNESS, POST_THICKNESS, GOAL_DEPTH]} />
            <meshStandardMaterial {...postMaterial} />
          </mesh>
        </group>
      );
    };

    goals.push(createSingleGoal(-FIELD_LENGTH / 2 + 0.12, "goal-1"));
    goals.push(createSingleGoal(FIELD_LENGTH / 2 - 0.12, "goal-2"));
    return goals;
  };

  const createMarkings = () => {
    const markings = [];
    const lineY = 0.015;
    const outlineWidth = LINE_THICKNESS;
    markings.push(
      <mesh key="top-line" position={[0, lineY, -FIELD_LENGTH / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FIELD_WIDTH, outlineWidth]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="bottom-line" position={[0, lineY, FIELD_LENGTH / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FIELD_WIDTH, outlineWidth]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="left-line" position={[-FIELD_WIDTH / 2, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[outlineWidth, FIELD_LENGTH]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="right-line" position={[FIELD_WIDTH / 2, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[outlineWidth, FIELD_LENGTH]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="center-line" position={[0, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FIELD_WIDTH, LINE_THICKNESS]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="center-circle" position={[0, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[CENTER_CIRCLE_RADIUS - LINE_THICKNESS / 2, CENTER_CIRCLE_RADIUS + LINE_THICKNESS / 2, 64]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    markings.push(
      <mesh key="center-spot" position={[0, lineY + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[LINE_THICKNESS, 16]} />
        <meshBasicMaterial color={0xffffff} side={2} />
      </mesh>
    );
    const createAreaLines = (zSign) => {
      const penaltyLineZ = zSign * (FIELD_LENGTH / 2 - PENALTY_AREA_LENGTH);
      const goalLineZ = zSign * (FIELD_LENGTH / 2 - GOAL_AREA_LENGTH);
      markings.push(
        <mesh key={`penalty-top-${zSign}`} position={[0, lineY, penaltyLineZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[PENALTY_AREA_WIDTH, LINE_THICKNESS]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh
          key={`penalty-left-${zSign}`}
          position={[-PENALTY_AREA_WIDTH / 2, lineY, zSign * (FIELD_LENGTH / 2 - PENALTY_AREA_LENGTH / 2)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[LINE_THICKNESS, PENALTY_AREA_LENGTH]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh
          key={`penalty-right-${zSign}`}
          position={[PENALTY_AREA_WIDTH / 2, lineY, zSign * (FIELD_LENGTH / 2 - PENALTY_AREA_LENGTH / 2)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[LINE_THICKNESS, PENALTY_AREA_LENGTH]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh key={`goal-area-top-${zSign}`} position={[0, lineY, goalLineZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GOAL_AREA_WIDTH, LINE_THICKNESS]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh
          key={`goal-area-left-${zSign}`}
          position={[-GOAL_AREA_WIDTH / 2, lineY, zSign * (FIELD_LENGTH / 2 - GOAL_AREA_LENGTH / 2)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[LINE_THICKNESS, GOAL_AREA_LENGTH]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh
          key={`goal-area-right-${zSign}`}
          position={[GOAL_AREA_WIDTH / 2, lineY, zSign * (FIELD_LENGTH / 2 - GOAL_AREA_LENGTH / 2)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[LINE_THICKNESS, GOAL_AREA_LENGTH]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      markings.push(
        <mesh
          key={`penalty-spot-${zSign}`}
          position={[0, lineY + 0.001, zSign * (FIELD_LENGTH / 2 - PENALTY_SPOT_DISTANCE)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[LINE_THICKNESS * 1.2, 16]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
      const arcCenterZ = zSign * (FIELD_LENGTH / 2 - PENALTY_SPOT_DISTANCE);
      const halfPenaltyWidth = PENALTY_AREA_WIDTH / 2;
      const ratio = halfPenaltyWidth / PENALTY_ARC_RADIUS;
      const safeRatio = Math.min(Math.max(ratio, -0.99), 0.8);
      const arcStartAngle = Math.acos(safeRatio);
      const arcEndAngle = Math.PI - arcStartAngle;
      let startAngle, endAngle;
      if (zSign > 0) {
        startAngle = arcStartAngle;
        endAngle = arcEndAngle;
      } else {
        startAngle = Math.PI + arcStartAngle;
        endAngle = Math.PI + arcEndAngle;
      }
      if (isNaN(startAngle) || isNaN(endAngle) || Math.abs(endAngle - startAngle) < 0.01) {
        if (zSign > 0) {
          startAngle = Math.PI / 4;
          endAngle = (Math.PI * 3) / 4;
        } else {
          startAngle = (Math.PI * 5) / 4;
          endAngle = (Math.PI * 7) / 4;
        }
      }
      const innerRadius = Math.max(PENALTY_ARC_RADIUS - LINE_THICKNESS / 2, 0.01);
      const outerRadius = PENALTY_ARC_RADIUS + LINE_THICKNESS / 2;
      markings.push(
        <mesh key={`penalty-arc-${zSign}`} position={[0, lineY, arcCenterZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[innerRadius, outerRadius, 64, 1, startAngle, endAngle - startAngle]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
    };
    createAreaLines(1);
    createAreaLines(-1);
    const createCornerArc = (xSign, zSign, startAngle, key) => {
      let cornerInnerRadius = CORNER_ARC_RADIUS - LINE_THICKNESS / 2;
      const cornerOuterRadius = CORNER_ARC_RADIUS + LINE_THICKNESS / 2;
      if (cornerInnerRadius <= 0) cornerInnerRadius = 0.01;
      return (
        <mesh
          key={key}
          position={[(xSign * FIELD_WIDTH) / 2, lineY, (zSign * FIELD_LENGTH) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[cornerInnerRadius, cornerOuterRadius, 32, 1, startAngle, Math.PI / 2]} />
          <meshBasicMaterial color={0xffffff} side={2} />
        </mesh>
      );
    };
    return [
      createCornerArc(1, 1, Math.PI / 2, "corner-arc-1"),
      createCornerArc(-1, 1, 0, "corner-arc-2"),
      createCornerArc(1, -1, Math.PI, "corner-arc-3"),
      createCornerArc(-1, -1, -Math.PI / 2, "corner-arc-4"),
      ...markings,
    ];
  };

  const [score, setScore] = useState({red: 0, blue: 0});
  const ballRef = useRef();

  const GOAL_TRIGGER_DEPTH = 0.5;
  const goalTriggerY = 0.4;

  const handleGoal = useCallback(
    (which) => {
      setScore((prev) => {
        if (which === "red-goal") {
          return {...prev, blue: prev.blue + 1};
        } else if (which === "blue-goal") {
          return {...prev, red: prev.red + 1};
        }
        return prev;
      });
      if (ballRef.current) {
        ballRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
        ballRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
        const resetPosition = {
          x: position[0],
          y: position[1] + BALL_RADIUS * 1.6,
          z: position[2],
        };
        ballRef.current.setTranslation(resetPosition, true);
      }
    },
    [position]
  );

  const scoreTextGeometry = useMemo(() => {
    if (!font) return null;

    const scoreText = `red   ${score.red}:${score.blue}   blue`;
    const textHeight = 0.02; // Desired thickness

    const geom = new TextGeometry(scoreText, {
      font: font,
      size: 0.6,
      height: textHeight,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
    });

    // ** 關鍵修復：手動鉗位Z軸頂點位置以修正字體文件問題 **
    const positions = geom.attributes.position.array;
    // TextGeometry 默認從 z=0 擠出到 z=height
    for (let i = 2; i < positions.length; i += 3) {
      if (positions[i] > textHeight) positions[i] = textHeight;
      if (positions[i] < 0) positions[i] = 0;
    }
    geom.attributes.position.needsUpdate = true;
    // ** 修復結束 **

    geom.center(); // 將幾何體居中

    return geom;
  }, [score, font]);

  useEffect(() => {
    return () => {
      if (scoreTextGeometry) {
        scoreTextGeometry.dispose();
      }
    };
  }, [scoreTextGeometry]);

  return (
    <group position={position} name="SoccerField">
      <group position={[0, GOAL_HEIGHT + 1.2, -FIELD_LENGTH / 2 - 0.2]}>
        <mesh>
          <planeGeometry args={[8, 1.6]} />
          <meshMatcapMaterial matcap={matcapTexture} color={0xff4444} />
        </mesh>
        {scoreTextGeometry && (
          <mesh position={[0, 0, 0.02]} geometry={scoreTextGeometry}>
            <meshMatcapMaterial matcap={matcapTexture} color={0xffffff} />
          </mesh>
        )}
      </group>
      <group position={[0, GOAL_HEIGHT + 1.2, FIELD_LENGTH / 2 + 0.2]} rotation={[0, Math.PI, 0]}>
        <mesh>
          <planeGeometry args={[8, 1.6]} />
          <meshMatcapMaterial matcap={matcapTexture} color={0x448aff} />
        </mesh>
        {scoreTextGeometry && (
          <mesh position={[0, 0, 0.02]} geometry={scoreTextGeometry}>
            <meshMatcapMaterial matcap={matcapTexture} color={0xffffff} />
          </mesh>
        )}
      </group>

      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FIELD_WIDTH, FIELD_LENGTH]} />
        <meshStandardMaterial color={0x2e8b57} roughness={0.8} metalness={0.1} />
      </mesh>

      <mesh position={[-FIELD_WIDTH / 2 - BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOUNDARY_THICKNESS, BOUNDARY_HEIGHT, FIELD_LENGTH]} />
        <meshStandardMaterial color={0xf5f5f5} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[FIELD_WIDTH / 2 + BOUNDARY_THICKNESS / 2, BOUNDARY_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOUNDARY_THICKNESS, BOUNDARY_HEIGHT, FIELD_LENGTH]} />
        <meshStandardMaterial color={0xf5f5f5} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, BOUNDARY_HEIGHT / 2, FIELD_LENGTH / 2 + BOUNDARY_THICKNESS / 2]} castShadow receiveShadow>
        <boxGeometry args={[FIELD_WIDTH, BOUNDARY_HEIGHT, BOUNDARY_THICKNESS]} />
        <meshStandardMaterial color={0xf5f5f5} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, BOUNDARY_HEIGHT / 2, -FIELD_LENGTH / 2 - BOUNDARY_THICKNESS / 2]} castShadow receiveShadow>
        <boxGeometry args={[FIELD_WIDTH, BOUNDARY_HEIGHT, BOUNDARY_THICKNESS]} />
        <meshStandardMaterial color={0xf5f5f5} roughness={0.7} metalness={0.1} />
      </mesh>

      <Boundaries />
      {createMarkings()}
      {createGoals()}

      <RigidBody type="fixed" colliders={false} name="red-goal-sensor">
        <CuboidCollider
          args={[GOAL_WIDTH / 2, goalTriggerY / 2, GOAL_TRIGGER_DEPTH / 2]}
          position={[0, goalTriggerY / 2, -FIELD_LENGTH / 2 + GOAL_TRIGGER_DEPTH]}
          sensor
          onIntersectionEnter={(e) => {
            if (e.other.rigidBodyObject?.name === "soccer-ball") handleGoal("red-goal");
          }}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} name="blue-goal-sensor">
        <CuboidCollider
          args={[GOAL_WIDTH / 2, goalTriggerY / 2, GOAL_TRIGGER_DEPTH / 2]}
          position={[0, goalTriggerY / 2, FIELD_LENGTH / 2 - GOAL_TRIGGER_DEPTH]}
          sensor
          onIntersectionEnter={(e) => {
            if (e.other.rigidBodyObject?.name === "soccer-ball") handleGoal("blue-goal");
          }}
        />
      </RigidBody>

      <RigidBody
        ref={ballRef}
        name="soccer-ball"
        colliders={false}
        restitution={0.9}
        friction={0.2}
        linearDamping={0.2}
        angularDamping={0.2}
        position={[0, BALL_RADIUS * 1.6, 0]}
      >
        <BallCollider args={[BALL_RADIUS]} />
        <mesh castShadow>
          <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          <meshStandardMaterial map={ballTexture} color={0xffffff} roughness={0.35} metalness={0.1} />
        </mesh>
      </RigidBody>
    </group>
  );
}
