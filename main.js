const WIDTH = 800;
const HEIGHT = 800;
const $CANVAS = document.getElementById('canvas');
const ctx = $CANVAS.getContext('2d');

$CANVAS.width = WIDTH;
$CANVAS.height = HEIGHT;

ctx.strokeStyle = '#ff0000';
ctx.lineWidth = 1;

let TRIANGLES = [];
let rotationY = 45;
let rotationX = 0;
let cameraDistance = 4;

function multiplyMatrixVector(m, v) {
  return {
    x: v.x * m[0] + v.y * m[1] + v.z * m[2] + m[3],
    y: v.x * m[4] + v.y * m[5] + v.z * m[6] + m[7],
    z: v.x * m[8] + v.y * m[9] + v.z * m[10] + m[11],
    w: v.x * m[12] + v.y * m[13] + v.z * m[14] + m[15]
  };
}

function getRotationYMatrix(angle) {
  const rad = angle * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1
  ];
}

function getRotationXMatrix(angle) {
  const rad = angle * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1
  ];
}

function getTranslationMatrix(x, y, z) {
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1
  ];
}

function multiplyMatrices(a, b) {
  const result = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return result;
}

function convertToScreen(v) {
  if (v.w === 0) return null;

  const x = v.x / v.w;
  const y = v.y / v.w;
  const z = v.z / v.w;

  return {
    x: (x + 1) * 0.5 * WIDTH,
    y: (1 - y) * 0.5 * HEIGHT,
    z: z
  };
}

function computeBounds(triangles) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const tri of triangles) {
    for (const v of tri) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
      maxZ = Math.max(maxZ, v.z);
    }
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function normalizeModel(triangles) {
  const b = computeBounds(triangles);

  const centerX = (b.minX + b.maxX) / 2;
  const centerY = (b.minY + b.maxY) / 2;
  const centerZ = (b.minZ + b.maxZ) / 2;

  const sizeX = b.maxX - b.minX;
  const sizeY = b.maxY - b.minY;
  const sizeZ = b.maxZ - b.minZ;

  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const scale = 2 / maxSize;

  for (const tri of triangles) {
    for (const v of tri) {
      v.x = (v.x - centerX) * scale;
      v.y = (v.y - centerY) * scale;
      v.z = (v.z - centerZ) * scale;
    }
  }

  return triangles;
}

function parseOBJ(text) {
  const vertices = [];
  const triangles = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);

    if (parts[0] === 'v') {
      vertices.push({
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3])
      });
    }

    if (parts[0] === 'f') {
      const idx = parts.slice(1).map(p =>
        parseInt(p.split('/')[0], 10) - 1
      );

      if (idx.length >= 3) {
        triangles.push([
          { ...vertices[idx[0]] },
          { ...vertices[idx[1]] },
          { ...vertices[idx[2]] }
        ]);
      }
    }
  }

  return triangles;
}

function drawTriangles() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const rotY = getRotationYMatrix(rotationY);
  const rotX = getRotationXMatrix(rotationX);
  const trans = getTranslationMatrix(0, 0, -cameraDistance);

  let transform = multiplyMatrices(trans, rotY);
  transform = multiplyMatrices(transform, rotX);

  const fov = 90 * Math.PI / 180;
  const aspect = WIDTH / HEIGHT;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);

  const projection = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
    0, 0, -1, 0
  ];

  const projectedTris = [];

  for (const tri of TRIANGLES) {
    const transformed = tri.map(v => {
      const t = multiplyMatrixVector(transform, v);
      return multiplyMatrixVector(projection, t);
    });

    const avgZ = (transformed[0].z + transformed[1].z + transformed[2].z) / 3;

    projectedTris.push({
      vertices: transformed,
      depth: avgZ
    });
  }

  projectedTris.sort((a, b) => b.depth - a.depth);

  for (const tri of projectedTris) {
    const screenVerts = tri.vertices.map(v => convertToScreen(v));

    if (screenVerts.some(v => v === null)) continue;

    ctx.beginPath();
    ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
    ctx.lineTo(screenVerts[1].x, screenVerts[1].y);
    ctx.lineTo(screenVerts[2].x, screenVerts[2].y);
    ctx.closePath();
    ctx.stroke();
  }
}

document.getElementById('rotY').addEventListener('input', (e) => {
  rotationY = parseFloat(e.target.value);
  document.getElementById('rotYVal').textContent = rotationY + '°';
  drawTriangles();
});

document.getElementById('rotX').addEventListener('input', (e) => {
  rotationX = parseFloat(e.target.value);
  document.getElementById('rotXVal').textContent = rotationX + '°';
  drawTriangles();
});

document.getElementById('camDist').addEventListener('input', (e) => {
  cameraDistance = parseFloat(e.target.value);
  document.getElementById('camDistVal').textContent = cameraDistance;
  drawTriangles();
});

function generateCube() {
  return [
    [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }],
    [{ x: -1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }],

    [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: -1 }],
    [{ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: -1, z: -1 }],

    [{ x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }],
    [{ x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }],

    [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 }],
    [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: -1, y: -1, z: 1 }],

    [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }],
    [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: 1 }],

    [{ x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: 1, z: 1 }],
    [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }]
  ];
}

fetch('human.obj')
  .then(r => r.text())
  .then(text => {
    TRIANGLES = parseOBJ(text);
    console.log('Loaded triangles:', TRIANGLES.length);
    normalizeModel(TRIANGLES);
    drawTriangles();
  })
  .catch(err => {
    console.log('Could not load human.ob using cube');
    TRIANGLES = generateCube();
    drawTriangles();
  });