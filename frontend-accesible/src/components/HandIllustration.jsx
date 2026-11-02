// Manos dibujadas en SVG (copiadas del tutorial original) para A, L, U y ILY.

function SvgBase({ children }) {
  return (
    <svg className="sign-illustration" viewBox="0 0 220 220" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="skinMain" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe1bf" />
          <stop offset="62%" stopColor="#f5b77f" />
          <stop offset="100%" stopColor="#e59a63" />
        </linearGradient>
        <linearGradient id="skinSoft" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe8cf" />
          <stop offset="100%" stopColor="#f0aa73" />
        </linearGradient>
      </defs>
      <rect className="sign-glow" x="18" y="18" width="184" height="184" rx="48" />
      {children}
    </svg>
  );
}

function ExtendedFinger({ x, y, width = 27, height = 112, rotate = 0 }) {
  return (
    <g transform={`rotate(${rotate} ${x + width / 2} ${y + height})`}>
      <rect className="sign-finger" x={x} y={y} width={width} height={height} rx={width / 2} />
      <line
        className="sign-crease"
        x1={x + 6}
        y1={y + height * 0.42}
        x2={x + width - 6}
        y2={y + height * 0.42}
      />
      <line
        className="sign-crease"
        x1={x + 6}
        y1={y + height * 0.66}
        x2={x + width - 6}
        y2={y + height * 0.66}
      />
    </g>
  );
}

function FoldedKnuckle({ x, y, width = 32, height = 42, rotate = 0 }) {
  return (
    <g transform={`rotate(${rotate} ${x + width / 2} ${y + height / 2})`}>
      <rect className="sign-knuckle" x={x} y={y} width={width} height={height} rx="14" />
      <path
        className="sign-crease"
        d={`M${x + 7} ${y + 17} C${x + width / 2} ${y + 23} ${x + width - 7} ${y + 17} ${x + width - 7} ${y + 17}`}
      />
    </g>
  );
}

function Palm() {
  return (
    <>
      <path
        className="sign-palm"
        d="M67 92 C67 75 82 63 104 63 H121 C144 63 159 78 159 101 V153 C159 183 141 203 113 203 C84 203 63 183 63 153 V106 C63 100 64 96 67 92 Z"
      />
      <path className="sign-palm-line" d="M82 139 C99 132 122 133 141 145" />
      <path className="sign-palm-line" d="M86 164 C104 174 125 174 142 163" />
    </>
  );
}

function ThumbSide() {
  return (
    <path
      className="sign-thumb"
      d="M151 104 C171 111 181 126 176 141 C172 154 158 154 150 143 C143 133 139 119 142 111 C144 106 147 104 151 104 Z"
    />
  );
}

function ThumbOpen() {
  return (
    <path
      className="sign-thumb"
      d="M66 112 C48 102 35 88 31 76 C28 66 35 58 44 62 C58 68 72 83 82 99 C88 109 78 119 66 112 Z"
    />
  );
}

function ThumbAcross() {
  return (
    <path
      className="sign-thumb"
      d="M74 129 C94 114 124 110 146 121 C156 126 156 139 146 145 C126 157 94 153 73 142 C65 138 66 134 74 129 Z"
    />
  );
}

function HandA() {
  return (
    <SvgBase>
      <FoldedKnuckle x={70} y={64} width={28} height={48} rotate={-5} />
      <FoldedKnuckle x={95} y={58} width={30} height={54} />
      <FoldedKnuckle x={122} y={62} width={29} height={50} rotate={5} />
      <FoldedKnuckle x={148} y={78} width={24} height={38} rotate={11} />
      <Palm />
      <ThumbSide />
    </SvgBase>
  );
}

function HandL() {
  return (
    <SvgBase>
      <ExtendedFinger x={86} y={21} width={29} height={122} />
      <FoldedKnuckle x={115} y={86} width={30} height={45} rotate={5} />
      <FoldedKnuckle x={141} y={94} width={27} height={38} rotate={12} />
      <FoldedKnuckle x={67} y={91} width={26} height={40} rotate={-10} />
      <Palm />
      <ThumbOpen />
    </SvgBase>
  );
}

function HandU() {
  return (
    <SvgBase>
      <ExtendedFinger x={81} y={22} width={28} height={121} rotate={-1} />
      <ExtendedFinger x={110} y={22} width={28} height={121} rotate={1} />
      <FoldedKnuckle x={139} y={92} width={27} height={40} rotate={10} />
      <FoldedKnuckle x={61} y={97} width={25} height={36} rotate={-10} />
      <Palm />
      <ThumbAcross />
    </SvgBase>
  );
}

function HandIly() {
  return (
    <SvgBase>
      <ExtendedFinger x={84} y={24} width={29} height={119} />
      <ExtendedFinger x={143} y={43} width={25} height={99} rotate={13} />
      <FoldedKnuckle x={113} y={86} width={29} height={45} rotate={5} />
      <FoldedKnuckle x={60} y={96} width={25} height={37} rotate={-11} />
      <Palm />
      <ThumbOpen />
    </SvgBase>
  );
}

function HandIllustration({ signId }) {
  const illustrations = {
    A: <HandA />,
    L: <HandL />,
    U: <HandU />,
    ILY: <HandIly />,
  };

  return <div className="hand-reference">{illustrations[signId] || <HandA />}</div>;
}

export default HandIllustration;
