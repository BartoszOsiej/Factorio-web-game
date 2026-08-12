import glowFrag from '../shaders/glow.frag?raw';

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let texture: WebGLTexture | null = null;

const vs = `
attribute vec2 aPos;
attribute vec2 aUV;
varying vec2 vTexCoord;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vTexCoord = aUV;
}
`;

function compileShader(src: string, type: number): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  return s;
}

export function initPostProc(canvas: HTMLCanvasElement) {
  gl = canvas.getContext('webgl', { premultipliedAlpha: false });
  if (!gl) return false;

  const vsShader = compileShader(vs, gl.VERTEX_SHADER);
  const fsShader = compileShader(glowFrag, gl.FRAGMENT_SHADER);
  program = gl.createProgram()!;
  gl.attachShader(program, vsShader);
  gl.attachShader(program, fsShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  // Full-screen quad
  const verts = new Float32Array([
    -1, -1, 0, 0,  1, -1, 1, 0,
    -1,  1, 0, 1,  1,  1, 1, 1,
  ]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  const aUV = gl.getAttribLocation(program, 'aUV');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

  return true;
}

export function applyPostProc(sourceCanvas: HTMLCanvasElement, time: number) {
  if (!gl || !program) return false;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (gl.canvas.width !== w || gl.canvas.height !== h) {
    gl.canvas.width = w;
    gl.canvas.height = h;
  }

  gl.viewport(0, 0, w, h);
  gl.useProgram(program);

  gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);
  gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);

  // Upload source as texture
  if (!texture) texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);

  // Draw full-screen quad
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

export function destroyPostProc() {
  gl = null;
  program = null;
  texture = null;
}
