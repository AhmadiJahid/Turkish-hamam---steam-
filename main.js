/**
 * WebGL2 Fullscreen Quad Demo
 * 
 * Features:
 * - WebGL2 context initialization
 * - Shader compilation from embedded script tags
 * - Fullscreen quad rendering (no vertex buffers needed)
 * - Uniforms: time, resolution, mouse, quality
 * - Responsive resize handling
 * - FPS counter
 * - Quality slider for future raymarch step control
 * 
 * Optimized for Intel UHD integrated graphics.
 */

// ============================================================================
// Global State
// ============================================================================

/** @type {WebGL2RenderingContext} */
let gl = null;

/** @type {WebGLProgram} */
let shaderProgram = null;

/** Uniform locations cache */
const uniforms = {
    time: null,
    resolution: null,
    mouse: null,
    quality: null
};

/** Application state */
const state = {
    startTime: 0,
    mouseX: 0.5,        // Normalized mouse X (0-1)
    mouseY: 0.5,        // Normalized mouse Y (0-1)
    quality: 1,         // Quality level (0, 1, 2)
    frameCount: 0,
    lastFpsUpdate: 0,
    fps: 0
};

// ============================================================================
// Shader Compilation Utilities
// ============================================================================

/**
 * Compiles a shader from source code.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source - GLSL source code
 * @returns {WebGLShader|null} Compiled shader or null on error
 */
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Check compilation status
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
        console.error(`${shaderType} shader compilation failed:\n${info}`);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

/**
 * Links vertex and fragment shaders into a program.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {WebGLShader} vertexShader - Compiled vertex shader
 * @param {WebGLShader} fragmentShader - Compiled fragment shader
 * @returns {WebGLProgram|null} Linked program or null on error
 */
function linkProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // Check link status
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        console.error(`Shader program linking failed:\n${info}`);
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

/**
 * Creates shader program from script tag IDs.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {string} vertexScriptId - ID of vertex shader script element
 * @param {string} fragmentScriptId - ID of fragment shader script element
 * @returns {WebGLProgram|null} Linked program or null on error
 */
function createProgramFromScripts(gl, vertexScriptId, fragmentScriptId) {
    // Get shader source from script tags
    const vertexScript = document.getElementById(vertexScriptId);
    const fragmentScript = document.getElementById(fragmentScriptId);

    if (!vertexScript || !fragmentScript) {
        console.error('Shader script elements not found');
        return null;
    }

    const vertexSource = vertexScript.textContent.trim();
    const fragmentSource = fragmentScript.textContent.trim();

    // Compile shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) {
        return null;
    }

    // Link program
    const program = linkProgram(gl, vertexShader, fragmentShader);

    // Clean up individual shaders (they're now part of the program)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
}

// ============================================================================
// WebGL2 Initialization
// ============================================================================

/**
 * Initializes WebGL2 context and shader program.
 * @returns {boolean} True if initialization succeeded
 */
function initWebGL() {
    const canvas = document.getElementById('glCanvas');
    
    // Request WebGL2 context with performance hints for iGPU
    gl = canvas.getContext('webgl2', {
        alpha: false,               // No alpha in backbuffer (slight perf gain)
        antialias: false,           // Disable AA for better iGPU performance
        powerPreference: 'default', // Let browser decide (good for iGPU)
        preserveDrawingBuffer: false
    });

    if (!gl) {
        console.error('WebGL2 is not supported by this browser');
        alert('WebGL2 is not supported. Please use a modern browser.');
        return false;
    }

    console.log('WebGL2 initialized');
    console.log('Renderer:', gl.getParameter(gl.RENDERER));
    console.log('Vendor:', gl.getParameter(gl.VENDOR));

    // Create shader program from embedded scripts
    shaderProgram = createProgramFromScripts(gl, 'vertex-shader', 'fragment-shader');
    
    if (!shaderProgram) {
        console.error('Failed to create shader program');
        return false;
    }

    // Cache uniform locations for efficient updates
    uniforms.time = gl.getUniformLocation(shaderProgram, 'u_time');
    uniforms.resolution = gl.getUniformLocation(shaderProgram, 'u_resolution');
    uniforms.mouse = gl.getUniformLocation(shaderProgram, 'u_mouse');
    uniforms.quality = gl.getUniformLocation(shaderProgram, 'u_quality');

    // Use the shader program
    gl.useProgram(shaderProgram);

    // Set initial canvas size
    resizeCanvas();

    return true;
}

// ============================================================================
// Canvas Resize Handling
// ============================================================================

/**
 * Resizes canvas to match display size and updates WebGL viewport.
 * Uses devicePixelRatio for sharp rendering on HiDPI displays,
 * but caps it for iGPU performance.
 */
function resizeCanvas() {
    const canvas = gl.canvas;
    
    // Cap pixel ratio for iGPU performance (max 1.5x)
    const maxPixelRatio = 1.5;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    
    // Calculate required canvas size
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

    // Only resize if dimensions changed
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        
        // Update WebGL viewport
        gl.viewport(0, 0, displayWidth, displayHeight);
        
        console.log(`Canvas resized to ${displayWidth}x${displayHeight}`);
    }
}

// ============================================================================
// Input Handling
// ============================================================================

/**
 * Sets up mouse and touch event listeners for interactive uniforms.
 */
function setupInputHandlers() {
    const canvas = document.getElementById('glCanvas');

    // Mouse movement - update normalized coordinates
    canvas.addEventListener('mousemove', (e) => {
        state.mouseX = e.clientX / canvas.clientWidth;
        state.mouseY = 1.0 - (e.clientY / canvas.clientHeight); // Flip Y for GL coords
    });

    // Touch support for mobile
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        state.mouseX = touch.clientX / canvas.clientWidth;
        state.mouseY = 1.0 - (touch.clientY / canvas.clientHeight);
    }, { passive: false });

    // Quality slider
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');

    qualitySlider.addEventListener('input', (e) => {
        state.quality = parseInt(e.target.value, 10);
        qualityValue.textContent = state.quality;
    });

    // Window resize handler with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeCanvas, 100);
    });
}

// ============================================================================
// FPS Counter
// ============================================================================

/**
 * Updates FPS counter display.
 * Called every frame, but only updates display periodically.
 * @param {number} currentTime - Current timestamp in milliseconds
 */
function updateFPS(currentTime) {
    state.frameCount++;
    
    // Update FPS display every 500ms
    const elapsed = currentTime - state.lastFpsUpdate;
    if (elapsed >= 500) {
        state.fps = Math.round((state.frameCount * 1000) / elapsed);
        state.frameCount = 0;
        state.lastFpsUpdate = currentTime;
        
        document.getElementById('fps-counter').textContent = `FPS: ${state.fps}`;
    }
}

// ============================================================================
// Render Loop
// ============================================================================

/**
 * Main render function - called every frame via requestAnimationFrame.
 * @param {number} timestamp - High-resolution timestamp from rAF
 */
function render(timestamp) {
    // Calculate elapsed time in seconds
    const timeSeconds = (timestamp - state.startTime) / 1000;

    // Update FPS counter
    updateFPS(timestamp);

    // Ensure canvas matches display size (handles dynamic resizes)
    resizeCanvas();

    // Update uniforms
    gl.uniform1f(uniforms.time, timeSeconds);
    gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(uniforms.mouse, state.mouseX, state.mouseY);
    gl.uniform1i(uniforms.quality, state.quality);

    // Clear and draw fullscreen quad
    // Using gl_VertexID in vertex shader, so no VBO needed - just draw 6 vertices
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Schedule next frame
    requestAnimationFrame(render);
}

// ============================================================================
// Entry Point
// ============================================================================

/**
 * Application entry point - called when DOM is ready.
 */
function main() {
    console.log('Initializing WebGL2 Demo...');

    // Initialize WebGL2
    if (!initWebGL()) {
        return;
    }

    // Setup input handlers
    setupInputHandlers();

    // Record start time for animation
    state.startTime = performance.now();
    state.lastFpsUpdate = state.startTime;

    // Start render loop
    console.log('Starting render loop');
    requestAnimationFrame(render);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
