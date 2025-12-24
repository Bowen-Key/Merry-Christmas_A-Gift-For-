/**
 * Project: Zero (The Gift - Final Polish +1)
 * 2025 Christmas Edition
 */

// ==========================================
// 1. 基础设置
// ==========================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const random = (min, max) => Math.random() * (max - min) + min;

// --- 核心变量 ---
let particles = [];
let snowballs = []; 
let catTargets = []; 

// 0: Intro, 1: Snow, 2: Summon, 3: Bond, 4: Ending
let currentPhase = 0; 

let touchStart = 0;
let isTouching = false;
let mouseVec = { x: -1000, y: -1000 }; 
let lastMouseVec = { x: 0, y: 0 };
let mouseVelocity = { x: 0, y: 0 }; 

let catCenterVec = { x: width/2, y: height/2 };

// 雪球蓄力
let snowballCharge = 0; 
let maxCharge = 120;

// 猫的状态
let catState = {
    vel: { x: 0, y: 0 },   
    trust: 0,              
    phase2Timer: 0,        
    knockbackTimer: 0,     
    isLost: false,         
    lostOpacity: 0,
    hitTextTimer: 0,
    isDissipating: false,
    
    // [新增] 降临后的停顿
    waitTimer: 60, // 1秒 (60帧)
    snowDoubled: false // 是否已经加过雪
};

let showEndingText = false;
let hintOpacity = 0; 
let introAlpha = 1.0; 
let introDissolving = false; 

// ==========================================
// 2. Vector (Zero Allocation)
// ==========================================
class Vector {
    constructor(x, y) { this.x = x || 0; this.y = y || 0; }
    add(v) { this.x += v.x; this.y += v.y; return this; }
    static dist(v1, v2) { return Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2)); }
    static sub(v1, v2) { return new Vector(v1.x - v2.x, v1.y - v2.y); }
    normalize() { let m = Math.sqrt(this.x*this.x + this.y*this.y); if (m !== 0) { this.x/=m; this.y/=m; } return this; }
    mult(n) { this.x *= n; this.y *= n; return this; }
}

// ==========================================
// 3. Snowball 类
// ==========================================
class Snowball {
    constructor(x, y, vx, vy, power) {
        this.pos = { x: x, y: y };
        this.vel = { x: vx, y: vy };
        this.size = 5 + (power / maxCharge) * 7; 
        this.life = 120; 
        this.active = true;
    }

    update() {
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.life--;
        if (this.life <= 0) this.active = false;

        let dx = this.pos.x - catCenterVec.x;
        let dy = this.pos.y - catCenterVec.y;
        let dist = Math.sqrt(dx*dx + dy*dy);

        if (this.active && dist < 70) { 
            this.active = false;
            let len = Math.sqrt(dx*dx + dy*dy) || 1;
            let nx = -(dx / len); 
            let ny = -(dy / len);
            
            catState.vel.x += nx * 4;
            catState.vel.y += ny * 4;
            catState.knockbackTimer = 30; 
            catState.hitTextTimer = 60;   
        }
    }

    draw() {
        let alpha = this.life / 120;
        ctx.fillStyle = `rgba(200, 240, 255, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// 4. Particle 类
// ==========================================
class Particle {
    constructor(targetIndex, forceBackground = false) {
        this.targetIndex = targetIndex % (catTargets.length || 1);
        
        // 如果指定强制背景，则一定是背景
        if (forceBackground) {
            this.isBackground = true;
        } else {
            this.isBackground = Math.random() < 0.2; 
        }

        this.isDetailed = Math.random() < 0.03; 
        this.noiseOffset = random(0, 1000); 
        this.alpha = 0.9;
        
        this.isTree = false; 
        this.isBell = false; 
        this.color = null;

        this.x = random(0, width);
        this.y = random(0, height);
        this.vx = random(-2, 2);
        this.vy = random(-2, 2);
        
        this.size = random(2.0, 4.5);
        this.baseSize = this.size;
        this.angle = random(0, Math.PI * 2);
        this.spin = random(-0.05, 0.05);
    }

    reset() {
        this.vx = random(-2, 2);
        this.vy = random(-2, 2);
        this.alpha = 0.9;
        this.size = this.baseSize;
    }

    update() {
        if (currentPhase === 0 && !introDissolving) return;

        if (this.isTree) {
            if (this.alpha < 1) this.alpha += 0.02;
            if (this.isBell) {
                let time = Date.now() * 0.005;
                this.x += Math.sin(time + this.noiseOffset) * 0.1;
            }
            if (Math.random() < 0.05) this.alpha = random(0.8, 1.0);
            return;
        }

        if (this.targetIndex === 0 && currentPhase === 1 && isTouching) {
            let duration = Date.now() - touchStart;
            if (duration > 3000) { 
                currentPhase = 2; 
                calculateCatSpawnPosition();
            }
        }

        if (currentPhase === 4 && !this.isBackground) {
            if (catState.isDissipating) {
                this.y -= random(0.5, 1.5);
                this.x += random(-0.5, 0.5);
                this.alpha -= 0.005; 
                if (this.alpha < 0) this.alpha = 0;
                return;
            }
            let targetX = width / 2 + catTargets[this.targetIndex].x;
            let targetY = (height - 100) + catTargets[this.targetIndex].y;
            this.x += (targetX - this.x) * 0.05;
            this.y += (targetY - this.y) * 0.05;
            this.alpha = 1.0;
            return;
        }

        // --- 物理 ---
        
        if (currentPhase === 1 || (this.isBackground && currentPhase >= 2) || introDissolving) {
            this.vx += random(-0.05, 0.05);
            this.vy += 0.025;

            let dx = this.x - mouseVec.x;
            let dy = this.y - mouseVec.y;
            let distSq = dx*dx + dy*dy;
            
            if (distSq < 14400 && currentPhase > 0) { 
                let dist = Math.sqrt(distSq) || 1;
                let nx = dx / dist;
                let ny = dy / dist;
                
                if (currentPhase === 2 && isTouching && snowballCharge < maxCharge) {
                    if (dist < 200) {
                        this.vx -= nx * 0.05;
                        this.vy -= ny * 0.05;
                    }
                } else {
                    let force = (120 - dist) * 0.15;
                    this.vx += nx * force;
                    this.vy += ny * force;
                }
            }

            if(this.x > width) this.x = 0;
            if(this.x < 0) this.x = width;
            if(this.y > height) this.y = 0;
            if(this.y < 0) this.y = height;

            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.95;
            this.vy *= 0.95;
            this.angle += this.spin;
        } 
        else if (currentPhase >= 2 && !this.isBackground) {
            const isStructure = this.targetIndex < catTargets.length;
            if (isStructure) {
                let offset = catTargets[this.targetIndex];
                
                let noiseIntensity = 12.0; 
                let speed = Math.sqrt(catState.vel.x**2 + catState.vel.y**2);
                noiseIntensity += speed * 8.0; 
                
                if (catState.knockbackTimer > 0) noiseIntensity += 40.0; 

                let noiseX = (Math.random() - 0.5) * noiseIntensity;
                let noiseY = (Math.random() - 0.5) * noiseIntensity;

                let targetX = catCenterVec.x + offset.x + noiseX;
                let targetY = catCenterVec.y + offset.y + noiseY;
                
                let lerpSpeed = (currentPhase === 2) ? 0.15 : 0.25;
                this.x += (targetX - this.x) * lerpSpeed;
                this.y += (targetY - this.y) * lerpSpeed;

                if (catState.knockbackTimer > 0) {
                    this.colorOverride = `rgba(255, 200, 200, 0.8)`; 
                } else {
                    this.colorOverride = null;
                }
                this.angle = 0; 

            } else {
                let dx = this.x - catCenterVec.x;
                let dy = this.y - catCenterVec.y;
                let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                let nx = dx / dist;
                let ny = dy / dist;

                if (dist < 60) { this.vx += nx * 3; this.vy += ny * 3; }
                
                this.vx -= nx * 0.3; 
                this.vy -= ny * 0.3;
                
                this.vx -= ny * 2.5; 
                this.vy += nx * 2.5;
                
                this.vx += random(-0.5, 0.5);
                this.vy += random(-0.5, 0.5);

                let vMag = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                if (vMag > 6) { this.vx *= 0.9; this.vy *= 0.9; }

                this.x += this.vx;
                this.y += this.vy;
                this.angle += this.spin;
            }
        }
    }

    draw() {
        if (currentPhase === 0 && !introDissolving) return;

        if (this.isTree) {
            ctx.fillStyle = this.color || "white";
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); 
            ctx.fill();
            ctx.globalAlpha = 1.0;
            return;
        }

        if (currentPhase === 1 || this.isBackground || introDissolving) {
            ctx.globalAlpha = 0.8; 
            ctx.fillStyle = "white";
            ctx.fillRect(this.x, this.y, this.size, this.size); 
            ctx.globalAlpha = 1.0;
        } 
        else {
            const isStructure = this.targetIndex < catTargets.length;
            if (isStructure) {
                ctx.fillStyle = this.colorOverride || "white";
                ctx.globalAlpha = this.alpha * 0.6; 
                ctx.fillRect(this.x, this.y, this.size, this.size); 
                ctx.globalAlpha = 1.0;
            } else {
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = "white";
                ctx.fillRect(this.x, this.y, 1, 1);
                ctx.globalAlpha = 1.0;
            }
        }
    }
}

// ==========================================
// 5. 游戏逻辑
// ==========================================
function calculateCatSpawnPosition() {
    const screenCX = width / 2;
    const screenCY = height / 2;
    const r = Math.min(width, height) * 0.4; 
    let dx = screenCX - mouseVec.x;
    let dy = screenCY - mouseVec.y;
    let mag = Math.sqrt(dx*dx + dy*dy);
    if (mag === 0) mag = 1;
    catCenterVec.x = mouseVec.x + (dx / mag) * r;
    catCenterVec.y = mouseVec.y + (dy / mag) * r;
}

function updateCatBehavior() {
    if (!isTouching && currentPhase === 2) {
        catState.isLost = true;
        snowballCharge = 0; 
    } else {
        catState.isLost = false;
        if (currentPhase === 2 && snowballCharge < maxCharge) {
            snowballCharge++;
        }
    }

    if (catState.knockbackTimer > 0) catState.knockbackTimer--;
    if (catState.hitTextTimer > 0) catState.hitTextTimer--;

    // === Phase 2 ===
    if (currentPhase === 2) {
        if (catState.isLost) {
            catState.vel.x *= 0.95;
            catState.vel.y *= 0.95;
            catCenterVec.x += catState.vel.x;
            catCenterVec.y += catState.vel.y;
            if (catState.lostOpacity < 1) catState.lostOpacity += 0.05;
        } else {
            catState.lostOpacity = 0; 
            if (catState.knockbackTimer <= 0) {
                let dx = mouseVec.x - catCenterVec.x;
                let dy = mouseVec.y - catCenterVec.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                let speed = dist > 200 ? 0.0028 : 0.0014;
                
                catState.vel.x = dx * speed;
                catState.vel.y = dy * speed;
                catCenterVec.x += catState.vel.x;
                catCenterVec.y += catState.vel.y;

                if (dist < 120) {
                    catState.phase2Timer++;
                    if (catState.phase2Timer > 180) {
                        currentPhase = 3;
                        catState.vel = {x:0, y:0};
                        snowballs = [];
                    }
                } else {
                    if (catState.phase2Timer > 0) catState.phase2Timer--;
                }
            } else {
                catState.vel.x *= 0.9;
                catState.vel.y *= 0.9;
                catCenterVec.x += catState.vel.x;
                catCenterVec.y += catState.vel.y;
            }
        }
    }
    // === Phase 3 ===
    else if (currentPhase === 3) {
        
        // [修改 1] 停顿逻辑：先停顿 1秒
        if (catState.waitTimer > 0) {
            catState.waitTimer--;
            catState.vel.x = 0;
            catState.vel.y = 0;
            return; // 不移动
        }

        // [修改 2] 雪量加倍
        if (!catState.snowDoubled) {
            // 增加 300 个雪花粒子
            for(let i=0; i<300; i++) {
                particles.push(new Particle(0, true)); // 强制为背景
            }
            catState.snowDoubled = true;
        }

        // 正常跟随
        let dx = mouseVec.x - catCenterVec.x;
        let dy = mouseVec.y - catCenterVec.y;
        const springK = 0.05; 
        const friction = 0.85;
        let ax = dx * springK;
        let ay = dy * springK;
        catState.vel.x += ax;
        catState.vel.y += ay;
        catState.vel.x *= friction;
        catState.vel.y *= friction;
        catCenterVec.x += catState.vel.x;
        catCenterVec.y += catState.vel.y;
        
        catState.trust++;
        if (catState.trust > 600) { 
            currentPhase = 4; 
            initChristmasTree();
        }
    }
}

function initChristmasTree() {
    growFractalTree(width / 2, height, height * 0.22, -Math.PI / 2, 8, 0);
    setTimeout(() => { showEndingText = true; }, 4000);
    setTimeout(() => { catState.isDissipating = true; }, 7000);
}

function growFractalTree(x, y, len, angle, depth, delay) {
    if (depth === 0) return;
    setTimeout(() => {
        let x2 = x + Math.cos(angle) * len;
        let y2 = y + Math.sin(angle) * len;
        let steps = 6;
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let px = x + (x2 - x) * t;
            let py = y + (y2 - y) * t;
            let p = new Particle(0);
            p.x = px; p.y = py;
            p.vx = 0; p.vy = 0;
            p.size = random(1.5, 3.5);
            p.alpha = 0; 
            p.isBackground = false; 
            p.isTree = true; 
            
            let r = Math.random();
            if (r > 0.9) {
                p.color = "rgba(255, 230, 50, 1.0)"; 
                p.size = random(3.5, 5.5);
                p.isBell = true;
            }
            else if (r > 0.8) {
                p.color = "rgba(255, 80, 80, 0.9)";
            }
            else {
                p.color = `rgba(100, 255, 150, ${random(0.5, 0.9)})`;
            }
            particles.push(p);
        }
        growFractalTree(x2, y2, len * 0.75, angle - 0.5, depth - 1, 0);
        growFractalTree(x2, y2, len * 0.75, angle + 0.5, depth - 1, 0);
    }, delay + 400); 
}

// ==========================================
// 6. 动画循环
// ==========================================
function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, width, height);
    
    // Intro Logic
    if (currentPhase === 0) {
        if (!introDissolving) {
            let pulse = (Math.sin(Date.now() * 0.002) + 1) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + pulse * 0.4})`;
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("[ Look, it’s snowing. ]", width / 2, height / 2);
        } else {
            introAlpha -= 0.02;
            if (introAlpha <= 0) {
                currentPhase = 1;
                introDissolving = false;
            }
        }
    }

    ctx.globalCompositeOperation = 'lighter';

    if (currentPhase >= 2) updateCatBehavior();
    
    // 蓄力动画
    if (currentPhase === 2 && isTouching && snowballCharge > 0 && snowballCharge < maxCharge) {
        let chargeProgress = snowballCharge / maxCharge;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + chargeProgress * 0.6})`;
        let particleCount = 10 + Math.floor(chargeProgress * 20); 
        for (let i = 0; i < particleCount; i++) {
            let angle = random(0, Math.PI * 2);
            let timeOffset = (Date.now() / 100) % 1; 
            let radius = 40 * (1 - timeOffset) + random(0, 10);
            let px = mouseVec.x + Math.cos(angle) * radius;
            let py = mouseVec.y + Math.sin(angle) * radius;
            ctx.beginPath();
            ctx.arc(px, py, random(1, 2), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "rgba(200, 240, 255, 0.8)";
        ctx.beginPath();
        ctx.arc(mouseVec.x, mouseVec.y, 4 + chargeProgress * 4, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (currentPhase === 2 && isTouching && snowballCharge >= maxCharge) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "cyan";
        ctx.beginPath();
        ctx.arc(mouseVec.x, mouseVec.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    particles.forEach(p => { p.update(); p.draw(); });
    snowballs = snowballs.filter(s => s.active);
    snowballs.forEach(s => { s.update(); s.draw(); });

    ctx.globalCompositeOperation = 'source-over';

    // 开局提示
    if (currentPhase === 1) {
        if (!isTouching) hintOpacity += (1 - hintOpacity) * 0.05;
        else hintOpacity += (0 - hintOpacity) * 0.2;
        
        if (hintOpacity > 0.01) {
            let pulse = (Math.sin(Date.now() * 0.003) + 1) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${hintOpacity * (0.5 + pulse * 0.5)})`;
            ctx.font = "16px Arial";
            ctx.textAlign = "center";
            ctx.fillText("[ touch to invoke ]", width / 2, height / 2);
        }
    }

    if (currentPhase === 2 && catState.isLost) {
        ctx.fillStyle = `rgba(255, 255, 255, ${catState.lostOpacity})`;
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("[ Where did you go...? ]", catCenterVec.x, catCenterVec.y - 60);
    }

    if (catState.hitTextTimer > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 100, 100, ${catState.hitTextTimer/60})`;
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        let floatY = (60 - catState.hitTextTimer) * 0.5;
        ctx.fillText("[ It really hurts... ]", catCenterVec.x, catCenterVec.y - 70 - floatY);
        ctx.restore();
    }

    if (showEndingText) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.font = "bold 22px Courier New"; 
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255, 215, 0, 0.6)";
        ctx.shadowBlur = 10;
        
        let textY = height * 0.15; 
        ctx.fillText("Merry Christmas.", width / 2, textY);
        
        ctx.shadowBlur = 0;
        ctx.font = "15px Courier New";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillText("Thankful for your presence.", width / 2, textY + 40);
    }
    
    requestAnimationFrame(animate);
}

// ==========================================
// 7. 输入处理
// ==========================================
function handleStart(x, y) {
    if (currentPhase === 0) {
        if (!introDissolving) {
            introDissolving = true; 
            mouseVec.x = x; mouseVec.y = y;
        }
        return;
    }

    isTouching = true; touchStart = Date.now();
    mouseVec.x = x; mouseVec.y = y;
    lastMouseVec.x = x; lastMouseVec.y = y;
    if (currentPhase === 2 && catState.isLost) catState.isLost = false;
}
function handleMove(x, y) {
    mouseVelocity.x = x - lastMouseVec.x;
    mouseVelocity.y = y - lastMouseVec.y;
    lastMouseVec.x = mouseVec.x; lastMouseVec.y = mouseVec.y;
    mouseVec.x = x; mouseVec.y = y;
}
function handleEnd() {
    isTouching = false;
    
    if (currentPhase === 2) {
        if (snowballCharge > 100) { 
            let speed = Math.sqrt(mouseVelocity.x**2 + mouseVelocity.y**2);
            let vx, vy;
            if (speed > 2) {
                vx = mouseVelocity.x * 1.5; vy = mouseVelocity.y * 1.5;
            } else {
                let dir = Vector.sub(catCenterVec, mouseVec).normalize().mult(8);
                vx = dir.x; vy = dir.y;
            }
            snowballs.push(new Snowball(mouseVec.x, mouseVec.y, vx, vy, snowballCharge));
        }
        snowballCharge = 0;
    }

    mouseVec.x = -1000; mouseVec.y = -1000;
    if (currentPhase === 1) particles.forEach(p => p.reset());
}

window.addEventListener('mousedown', e => handleStart(e.clientX, e.clientY));
window.addEventListener('mousemove', e => handleMove(e.clientX, e.clientY));
window.addEventListener('mouseup', handleEnd);
window.addEventListener('touchstart', e => { e.preventDefault(); handleStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchmove', e => { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend', handleEnd);

// ==========================================
// 8. 初始化
// ==========================================
function initCatPoints() {
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');
    const processSize = 300; 
    tmpCanvas.width = processSize; tmpCanvas.height = processSize;
    
    const ratio = Math.min(processSize / catImg.width, processSize / catImg.height);
    const newW = catImg.width * ratio; const newH = catImg.height * ratio;
    const offsetX = (processSize - newW) / 2; const offsetY = (processSize - newH) / 2;
    
    tmpCtx.drawImage(catImg, offsetX, offsetY, newW, newH);
    const imgData = tmpCtx.getImageData(0, 0, processSize, processSize);
    const data = imgData.data;
    
    catTargets = [];
    const denseStep = 4; 
    let minX=processSize, maxX=0, minY=processSize, maxY=0;
    for (let y = 0; y < processSize; y += denseStep) {
        for (let x = 0; x < processSize; x += denseStep) {
            const i = (y * processSize + x) * 4;
            if (data[i+3]>128 && data[i]<50) {
                if(x<minX) minX=x; if(x>maxX) maxX=x;
                if(y<minY) minY=y; if(y>maxY) maxY=y;
            }
        }
    }
    const catW = maxX - minX; const catH = maxY - minY;
    const centerX = minX + catW / 2; const centerY = minY + catH / 2;
    const sizeOnScreen = Math.min(width, height) * 0.25; 
    const scaleFactor = sizeOnScreen / Math.max(catW, catH); 

    for (let y = 0; y < processSize; y += denseStep) {
        for (let x = 0; x < processSize; x += denseStep) {
            const index = (y * processSize + x) * 4;
            if (data[index + 3] > 128 && data[index] < 50) {
                catTargets.push({
                    x: (x - centerX) * scaleFactor,
                    y: (y - centerY) * scaleFactor
                });
            }
        }
    }
    catTargets.sort(() => Math.random() - 0.5);
    if (catTargets.length > 800) catTargets.length = 800;
    
    particles = [];
    let particleCount = catTargets.length + 200; 
    for (let i = 0; i < particleCount; i++) { particles.push(new Particle(i)); }
}

const catImg = document.getElementById('catSource');
if (catImg.complete) { initCatPoints(); animate(); }
else { catImg.onload = function() { initCatPoints(); animate(); }; }