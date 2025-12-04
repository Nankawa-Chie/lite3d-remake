// Simple DFS-based maze generator adapted from Ghost_Haunt_Maze_v0.3.0.html
export default class MazeGenerator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.maze = [];
    this.visited = [];
    this.stack = [];
    this.initializeMaze();
  }
  initializeMaze() {
    for (let x = 0; x < this.width; x++) {
      this.maze[x] = [];
      this.visited[x] = [];
      for (let y = 0; y < this.height; y++) {
        this.maze[x][y] = 1; // 1 = wall, 0 = path, 2 = exit
        this.visited[x][y] = false;
      }
    }
  }
  isValidCell(x, y) {
    return x >= 1 && x < this.width - 1 && y >= 1 && y < this.height - 1;
  }
  getUnvisitedNeighbors(x, y) {
    const neighbors = [];
    const directions = [
      { x: 0, y: -2 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: -2, y: 0 },
    ];
    for (const dir of directions) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (this.isValidCell(nx, ny) && !this.visited[nx][ny]) neighbors.push({ x: nx, y: ny });
    }
    return neighbors;
  }
  createExit() {
    const exitX = this.width - 2;
    const exitY = this.height - 2;
    this.maze[exitX][exitY] = 2;
    this.maze[exitX - 1][exitY] = 0;
    this.maze[exitX][exitY - 1] = 0;
  }
  addExtraPaths() {
    const extra = Math.floor(this.width * this.height * 0.05);
    for (let i = 0; i < extra; i++) {
      const x = Math.floor(Math.random() * (this.width - 2)) + 1;
      const y = Math.floor(Math.random() * (this.height - 2)) + 1;
      if (this.maze[x][y] === 1) {
        // open sometimes when it creates interesting connections
        const adj = this.countAdjacentPaths(x, y);
        if (adj >= 2) this.maze[x][y] = 0;
      }
    }
  }
  countAdjacentPaths(x, y) {
    let c = 0;
    const dirs = [ {x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0} ];
    for (const d of dirs) {
      const nx = x + d.x, ny = y + d.y;
      if (nx>=0 && nx<this.width && ny>=0 && ny<this.height) {
        if (this.maze[nx][ny] === 0 || this.maze[nx][ny] === 2) c++;
      }
    }
    return c;
  }
  generate() {
    const sx = 1, sy = 1;
    this.maze[sx][sy] = 0;
    this.visited[sx][sy] = true;
    this.stack.push({ x: sx, y: sy });
    while (this.stack.length) {
      const cur = this.stack[this.stack.length - 1];
      const neighbors = this.getUnvisitedNeighbors(cur.x, cur.y);
      if (neighbors.length) {
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        const wallX = cur.x + (next.x - cur.x) / 2;
        const wallY = cur.y + (next.y - cur.y) / 2;
        this.maze[wallX][wallY] = 0;
        this.maze[next.x][next.y] = 0;
        this.visited[next.x][next.y] = true;
        this.stack.push(next);
      } else {
        this.stack.pop();
      }
    }
    this.createExit();
    this.addExtraPaths();
    return this.maze;
  }
  getStartPosition() { return { x: 1, y: 1 }; }
  getExitPosition() {
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.maze[x][y] === 2) return { x, y };
      }
    }
    return { x: this.width - 2, y: this.height - 2 };
  }
  isWall(x, y) {
    if (x<0||x>=this.width||y<0||y>=this.height) return true;
    return this.maze[x][y] === 1;
  }
  isExit(x, y) {
    if (x<0||x>=this.width||y<0||y>=this.height) return false;
    return this.maze[x][y] === 2;
  }
  getMaze() { return this.maze; }
}
