import SIK from "SpectaclesInteractionKit.lspkg/SIK"
import {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import {HandType} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandType"
import {InteractionStateMachine} from "./InteractionStateMachine"
import {NetworkSender, PointerPacket} from "./NetworkSender"
import {ScreenCalibrationPoints, ScreenProjection} from "./ScreenProjection"

type CalibrationCorner = keyof ScreenCalibrationPoints
type CornerHandleMap = Record<CalibrationCorner, SceneObject>

@component
export class AirTouchController extends BaseScriptComponent {
  @input
  @hint("Desktop companion WebSocket URL. Use your desktop IP on device, for example ws://192.168.1.40:8765.")
  private websocketUrl: string = "ws://127.0.0.1:8765"

  @input
  @hint("Tracked hand used for AirTouch. Use right or left.")
  private handType: string = "right"

  @input
  @hint("Meters from calibrated plane considered a touch.")
  private touchThresholdMeters: number = 0.04

  @input
  @hint("Meters from calibrated plane where touch releases. Keep above touchThresholdMeters to avoid click chatter.")
  private touchReleaseThresholdMeters: number = 0.065

  @input
  @hint("Meters from calibrated plane considered hover range.")
  private hoverThresholdMeters: number = 0.12

  @input
  @hint("UV deadzone. Tiny movement below this amount is ignored.")
  private deadzone: number = 0.002

  @input
  @hint("UV smoothing while hovering.")
  private hoverSmoothing: number = 0.5

  @input
  @hint("UV smoothing while dragging.")
  private dragSmoothing: number = 0.68

  @input
  @hint("UV smoothing on the first click frame.")
  private clickSmoothing: number = 0.9

  @input
  @hint("Seconds between WebSocket reconnect attempts.")
  private reconnectDelaySeconds: number = 1.5

  @input
  @hint("Print calibration, projection, and connection status.")
  private debugLogging: boolean = true

  @input
  @hint("In Lens Studio editor, use preview touch/mouse events as fake pointer packets.")
  private enableEditorSimulator: boolean = true

  @input
  @hint("Use calibrated screen-plane collision as touch down/up, no pinch required after calibration.")
  private enablePlaneTouchMode: boolean = true

  @input
  @hint("Pinch-drag in the hover band sends desktop scroll wheel events. Leave off when testing away-pinch click/drag.")
  private enableScrollGesture: boolean = false

  @input
  @hint("Move index and middle fingertips together over the calibrated screen to scroll.")
  private enableTwoFingerScroll: boolean = true

  @input
  @hint("When plane touch mode is on, require both fingertips to touch the plane for two-finger scroll.")
  private twoFingerScrollRequiresPlaneTouch: boolean = true

  @input
  @hint("Scroll wheel units produced by one normalized UV unit of pinch-drag movement.")
  private scrollSensitivity: number = 900

  @input
  @hint("Scroll wheel units produced by one normalized UV unit of two-finger movement.")
  private twoFingerScrollSensitivity: number = 1100

  @input
  @hint("Minimum index/middle fingertip separation in UV before two-finger scroll is considered.")
  private twoFingerMinSeparationUv: number = 0.025

  @input
  @hint("Maximum index/middle fingertip separation in UV before two-finger scroll is ignored.")
  private twoFingerMaxSeparationUv: number = 0.22

  @input
  @hint("Maximum index/middle distance-to-plane difference in meters for two-finger scroll.")
  private twoFingerMaxPlaneDeltaMeters: number = 0.12

  @input
  @hint("Seconds of light UV prediction to offset smoothing latency.")
  private predictionSeconds: number = 0.05

  @input
  @hint("Maximum predicted UV offset per frame.")
  private maxPredictionUv: number = 0.025

  @input
  @hint("Enable optional fingertip visual feedback objects.")
  private enableFingertipVisuals: boolean = true

  @input
  @hint("World scale for fingertip visuals while hovering.")
  private fingertipHoverScale: number = 0.012

  @input
  @hint("World scale for fingertip visuals while touching/clicking.")
  private fingertipTouchScale: number = 0.02

  @input
  @hint("World scale for fingertip visuals while two-finger scrolling.")
  private fingertipScrollScale: number = 0.016

  @input
  @hint("Show a generated mesh visual for the calibrated screen plane.")
  private enableCalibrationPlaneVisual: boolean = true

  @input
  @hint("Create a default plane visual object if one is not assigned.")
  private autoCreateCalibrationPlaneVisual: boolean = true

  @input
  @hint("Optional SceneObject used to render the calibrated screen plane.")
  private calibrationPlaneVisual: SceneObject

  @input
  @hint("Optional material used by the generated plane visual.")
  private calibrationPlaneMaterial: Material

  @input
  @hint("Small normal offset in meters to reduce z-fighting against real geometry.")
  private calibrationPlaneDepthBiasMeters: number = 0.001

  @input
  @hint("Prefab used to create the four manual calibration corner handles after the first calibration.")
  private cornerHandlePrefab: ObjectPrefab

  private enableManualCornerHandles: boolean = true

  @input
  @hint("World scale for the calibration corner handles. Increase this if the handles are too hard to grab.")
  private cornerHandleScaleMeters: number = 0.02

  private requireConfirmBeforeSending: boolean = true

  private confirmButton: SceneObject

  private confirmButtonActivationRadiusMeters: number = 0.05

  private confirmActionScript: ScriptComponent

  private confirmActionName: string = "onAirTouchConfirmed"

  private hand!: BaseHand
  private network!: NetworkSender
  private projection = new ScreenProjection()
  private interaction = new InteractionStateMachine()
  private points: Partial<ScreenCalibrationPoints> = {}
  private cornerIndex = 0
  private previousU = 0
  private previousV = 0
  private previousRawU = 0
  private previousRawV = 0
  private previousSmoothTime = 0
  private hasSmoothedUv = false
  private planeTouchActive = false
  private editorSimulatorActive = false
  private scrollGestureActive = false
  private previousScrollU = 0
  private previousScrollV = 0
  private twoFingerScrollActive = false
  private previousTwoFingerU = 0
  private previousTwoFingerV = 0
  private smoothedTwoFingerDeltaU = 0
  private smoothedTwoFingerDeltaV = 0
  private lastProjectionDebugAt = 0
  private generatedCalibrationPlaneVisual: SceneObject
  private cornerHandleInstances: Partial<CornerHandleMap> = {}
  private calibrationPlaneMeshBuilder: MeshBuilder
  private calibrationPlaneMeshVisual: RenderMeshVisual
  private lastHandleCalibrationPoints: ScreenCalibrationPoints | null = null
  private loggedMissingPlaneMaterial = false
  private loggedMissingConfirmButton = false
  private packetsEnabled = false

  private readonly corners: CalibrationCorner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"]
  private readonly cornerLabels: string[] = ["Top Left", "Top Right", "Bottom Left", "Bottom Right"]

  onAwake(): void {
    this.editorSimulatorActive = this.enableEditorSimulator && global.deviceInfoSystem.isEditor()
    this.network = new NetworkSender(this.websocketUrl, this.reconnectDelaySeconds, this.debugLogging, (command) => {
      if (command === "recalibrate") {
        this.recalibrateAirTouch()
      }
    })

    if (this.editorSimulatorActive) {
      this.bindEditorSimulator()
    } else {
      this.hand = SIK.HandInputData.getHand(this.getConfiguredHandType())
      this.hand.onPinchDown.add(() => this.handlePinchDown())
      this.setupCalibrationPlaneVisual()
      this.setupCornerHandles()
      this.setupConfirmButton()
    }

    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private start(): void {
    if (this.editorSimulatorActive) {
      this.log("editor simulator active; drag in preview to send pointer packets")
    } else {
      this.resetCalibration()
    }
    this.network.connect()
  }

  private update(): void {
    this.network.update()

    if (this.editorSimulatorActive) {
      return
    }

    if (!this.projection.isCalibrated() || !this.hand.isTracked()) {
      return
    }

    this.tryApplyCalibrationFromCornerHandles()

    const projected = this.projection.project(
      this.hand.indexTip.position,
      this.touchThresholdMeters,
      this.hoverThresholdMeters
    )
    const middleProjected = this.projection.project(
      this.hand.middleTip.position,
      this.touchThresholdMeters,
      this.hoverThresholdMeters
    )
    const pinching = this.hand.isPinching()
    this.debugProjection(projected)
    const planeTouching = this.updatePlaneTouchActive(projected)

    if (!this.packetsEnabled) {
      this.updateFingertipVisuals(projected, middleProjected, planeTouching, pinching, false)
      return
    }

    if (this.trySendTwoFingerScrollGesture(projected, middleProjected, pinching)) {
      this.updateFingertipVisuals(projected, middleProjected, planeTouching, pinching, true)
      return
    }

    if (!planeTouching && projected !== null && this.trySendScrollGesture(projected.u, projected.v, projected.distanceToPlane, projected.insideBounds, projected.nearPlane, projected.touchPlane, pinching)) {
      this.updateFingertipVisuals(projected, middleProjected, planeTouching, pinching, true)
      return
    }

    this.scrollGestureActive = false
    const pressed = pinching || planeTouching
    const state = this.interaction.update(projected, pressed)

    if (projected === null || !state.shouldSend) {
      this.updateFingertipVisuals(projected, middleProjected, planeTouching, pinching, false)
      return
    }

    const smoothing = state.phase === "down" ? this.clickSmoothing : pressed ? this.dragSmoothing : this.hoverSmoothing
    const smoothed = this.smooth(projected.u, projected.v, smoothing, pressed)

    const packet: PointerPacket = {
      type: "pointer",
      u: smoothed.u,
      v: smoothed.v,
      pinch: pressed,
      phase: state.phase,
      distanceToPlane: projected.distanceToPlane,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)
    this.updateFingertipVisuals(projected, middleProjected, planeTouching, pinching, false)

    if (this.debugLogging && state.phase !== "move") {
      print(
        "[AirTouch] " +
          state.phase +
          " u=" +
          packet.u.toFixed(3) +
          " v=" +
          packet.v.toFixed(3) +
          " d=" +
          packet.distanceToPlane.toFixed(3)
      )
    }
  }

  private trySendScrollGesture(
    u: number,
    v: number,
    distanceToPlane: number,
    insideBounds: boolean,
    nearPlane: boolean,
    touchPlane: boolean,
    pinching: boolean
  ): boolean {
    const shouldScroll = this.enableScrollGesture && pinching && insideBounds && nearPlane && !touchPlane

    if (!shouldScroll) {
      this.scrollGestureActive = false
      return false
    }

    if (!this.scrollGestureActive) {
      this.interaction.reset()
      this.previousScrollU = u
      this.previousScrollV = v
      this.scrollGestureActive = true
      this.log("scroll gesture started")
      return true
    }

    const deltaU = u - this.previousScrollU
    const deltaV = v - this.previousScrollV
    this.previousScrollU = u
    this.previousScrollV = v

    if (Math.abs(deltaU) < this.deadzone && Math.abs(deltaV) < this.deadzone) {
      return true
    }

    const packet: PointerPacket = {
      type: "pointer",
      u,
      v,
      pinch: true,
      phase: "scroll",
      distanceToPlane,
      scrollX: deltaU * this.scrollSensitivity,
      scrollY: -deltaV * this.scrollSensitivity,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging) {
      this.log(
        "scroll u=" +
          packet.u.toFixed(3) +
          " v=" +
          packet.v.toFixed(3) +
          " sx=" +
          packet.scrollX.toFixed(1) +
          " sy=" +
          packet.scrollY.toFixed(1)
      )
    }

    return true
  }

  private updatePlaneTouchActive(projected: ReturnType<ScreenProjection["project"]>): boolean {
    if (!this.enablePlaneTouchMode || projected === null || !projected.insideBounds) {
      this.planeTouchActive = false
      return false
    }

    const distance = Math.abs(projected.distanceToPlane)
    if (this.planeTouchActive) {
      this.planeTouchActive = distance <= this.touchReleaseThresholdMeters
    } else {
      this.planeTouchActive = distance <= this.touchThresholdMeters
    }

    return this.planeTouchActive
  }

  private updateFingertipVisuals(
    indexProjected: ReturnType<ScreenProjection["project"]>,
    middleProjected: ReturnType<ScreenProjection["project"]>,
    planeTouching: boolean,
    pinching: boolean,
    scrolling: boolean
  ): void {
    void indexProjected
    void middleProjected
    void planeTouching
    void pinching
    void scrolling

    if (!this.enableFingertipVisuals) {
      return
    }

    // Fingertip visuals are now expected to be authored in-scene if used.
    // Auto-spawned fingertip markers were removed to keep the runtime clean.
    return
  }

  private setupCalibrationPlaneVisual(): void {
    if (!this.enableCalibrationPlaneVisual || !this.autoCreateCalibrationPlaneVisual) {
      return
    }

    if (!hasSceneObject(this.calibrationPlaneVisual)) {
      this.generatedCalibrationPlaneVisual = this.createDefaultCalibrationPlaneVisual()
    }
  }

  private setupCornerHandles(): void {
    if (!this.enableManualCornerHandles) {
      return
    }
  }

  private setupConfirmButton(): void {
    if (!this.requireConfirmBeforeSending) {
      return
    }

    this.confirmButton = this.resolveConfirmButton()

    if (!hasSceneObject(this.confirmButton) && !this.loggedMissingConfirmButton) {
      this.loggedMissingConfirmButton = true
      this.log("confirm button not found; create a SceneObject named ConfirmButton and wire its callback to confirmAirTouch")
    }

    this.setConfirmButtonEnabled(false)
  }

  private getCornerHandles(): CornerHandleMap {
    return this.cornerHandleInstances as CornerHandleMap
  }

  private ensureCornerHandleInstances(): void {
    if (this.cornerHandleInstances.topLeft && this.cornerHandleInstances.topRight && this.cornerHandleInstances.bottomLeft && this.cornerHandleInstances.bottomRight) {
      return
    }

    if (!this.cornerHandlePrefab) {
      if (this.debugLogging) {
        this.log("cornerHandlePrefab is not assigned, so no calibration spheres can be instantiated")
      }
      return
    }

    this.cornerHandleInstances = {
      topLeft: this.instantiateCornerHandle(this.cornerHandlePrefab, "AirTouch Corner Top Left"),
      topRight: this.instantiateCornerHandle(this.cornerHandlePrefab, "AirTouch Corner Top Right"),
      bottomLeft: this.instantiateCornerHandle(this.cornerHandlePrefab, "AirTouch Corner Bottom Left"),
      bottomRight: this.instantiateCornerHandle(this.cornerHandlePrefab, "AirTouch Corner Bottom Right")
    }
  }

  private ensureCornerHandleInstance(corner: CalibrationCorner): SceneObject {
    const existing = this.cornerHandleInstances[corner]
    if (hasSceneObject(existing)) {
      return existing
    }

    if (!this.cornerHandlePrefab) {
      if (this.debugLogging) {
        this.log("cornerHandlePrefab is not assigned, so no calibration spheres can be instantiated")
      }
      return null
    }

    const instance = this.instantiateCornerHandle(this.cornerHandlePrefab, "AirTouch Corner " + this.cornerLabels[this.corners.indexOf(corner)])
    this.cornerHandleInstances[corner] = instance
    return instance
  }

  private instantiateCornerHandle(prefab: ObjectPrefab, name: string): SceneObject {
    const instance = prefab.instantiate(this.getSceneObject())
    instance.name = name
    instance.enabled = false
    instance.getTransform().setWorldScale(new vec3(this.cornerHandleScaleMeters, this.cornerHandleScaleMeters, this.cornerHandleScaleMeters))
    return instance
  }

  private getConfirmButton(): SceneObject {
    return hasSceneObject(this.confirmButton) ? this.confirmButton : this.resolveConfirmButton()
  }

  private setCornerHandlesVisible(visible: boolean): void {
    const handles = this.getCornerHandles()
    this.corners.forEach((corner) => {
      const handle = handles[corner]
      if (hasSceneObject(handle)) {
        handle.enabled = visible
      }
    })
  }

  private setConfirmButtonEnabled(enabled: boolean): void {
    const button = this.getConfirmButton()
    if (hasSceneObject(button)) {
      button.enabled = enabled
    }
  }

  private placeCornerHandles(points: ScreenCalibrationPoints): void {
    if (!this.enableManualCornerHandles) {
      return
    }

    this.corners.forEach((corner) => {
      this.placeCornerHandle(corner, points[corner])
    })
  }

  private placeCornerHandle(corner: CalibrationCorner, point: vec3): void {
    if (!this.enableManualCornerHandles) {
      return
    }

    const handle = this.ensureCornerHandleInstance(corner)
    if (!hasSceneObject(handle)) {
      return
    }

    const transform = handle.getTransform()
    transform.setWorldPosition(point)
    transform.setWorldScale(new vec3(this.cornerHandleScaleMeters, this.cornerHandleScaleMeters, this.cornerHandleScaleMeters))
    handle.enabled = true
  }

  private getPointsFromCornerHandles(): ScreenCalibrationPoints | null {
    const handles = this.getCornerHandles()
    const topLeft = handles.topLeft
    const topRight = handles.topRight
    const bottomLeft = handles.bottomLeft
    const bottomRight = handles.bottomRight

    if (!hasSceneObject(topLeft) || !hasSceneObject(topRight) || !hasSceneObject(bottomLeft) || !hasSceneObject(bottomRight)) {
      return null
    }

    return {
      topLeft: cloneVec3(topLeft.getTransform().getWorldPosition()),
      topRight: cloneVec3(topRight.getTransform().getWorldPosition()),
      bottomLeft: cloneVec3(bottomLeft.getTransform().getWorldPosition()),
      bottomRight: cloneVec3(bottomRight.getTransform().getWorldPosition())
    }
  }

  private tryApplyCalibrationFromCornerHandles(): void {
    if (!this.enableManualCornerHandles || !this.projection.isCalibrated()) {
      return
    }

    const points = this.getPointsFromCornerHandles()
    if (points === null) {
      return
    }

    if (this.lastHandleCalibrationPoints !== null && pointsNearlyEqual(points, this.lastHandleCalibrationPoints, 0.0005)) {
      return
    }

    if (this.projection.setCalibration(points)) {
      this.lastHandleCalibrationPoints = points
      this.updateCalibrationPlaneVisual(points)
    }
  }

  public confirmAirTouch(): void {
    this.confirmFromButtonCallback()
  }

  public onConfirmButtonTriggered(): void {
    this.confirmFromButtonCallback()
  }

  public recalibrateAirTouch(): void {
    this.resetCalibration()
  }

  public confirmFromButtonCallback(): void {
    if (!this.requireConfirmBeforeSending || this.packetsEnabled) {
      return
    }

    if (!this.projection.isCalibrated()) {
      this.log("confirm ignored; calibrate first")
      return
    }

    this.packetsEnabled = true
    this.setConfirmButtonEnabled(false)
    this.invokeConfirmActionCallback()
    this.log("confirm callback accepted; packet streaming enabled")
  }

  private resolveConfirmButton(): SceneObject {
    if (hasSceneObject(this.confirmButton)) {
      return this.confirmButton
    }

    return findSceneObjectByName("ConfirmButton")
  }

  private invokeConfirmActionCallback(): void {
    if (!this.confirmActionScript || !this.confirmActionName) {
      return
    }

    try {
      const script = this.confirmActionScript as any
      const callback = script[this.confirmActionName]
      if (typeof callback === "function") {
        callback.call(script)
      } else {
        this.log("confirm callback not found on script component: " + this.confirmActionName)
      }
    } catch (error) {
      this.log("confirm callback failed")
    }
  }

  private createDefaultCalibrationPlaneVisual(): SceneObject {
    const visual = global.scene.createSceneObject("AirTouch Calibration Plane")
    visual.createComponent("Component.RenderMeshVisual")
    visual.enabled = false
    return visual
  }

  private getCalibrationPlaneVisual(): SceneObject {
    return hasSceneObject(this.calibrationPlaneVisual) ? this.calibrationPlaneVisual : this.generatedCalibrationPlaneVisual
  }

  private getOrCreateCalibrationPlaneMeshVisual(visual: SceneObject): RenderMeshVisual {
    if (this.calibrationPlaneMeshVisual) {
      return this.calibrationPlaneMeshVisual
    }

    let meshVisual: RenderMeshVisual = null
    try {
      meshVisual = visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    } catch (error) {
      meshVisual = null
    }

    if (!meshVisual) {
      meshVisual = visual.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    }

    this.calibrationPlaneMeshVisual = meshVisual
    return meshVisual
  }

  private getOrCreateCalibrationPlaneMeshBuilder(): MeshBuilder {
    if (this.calibrationPlaneMeshBuilder) {
      return this.calibrationPlaneMeshBuilder
    }

    const builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2}
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    this.calibrationPlaneMeshBuilder = builder
    return builder
  }

  private updateCalibrationPlaneVisual(points: ScreenCalibrationPoints): void {
    if (!this.enableCalibrationPlaneVisual) {
      return
    }

    const visual = this.getCalibrationPlaneVisual()
    if (!hasSceneObject(visual)) {
      return
    }

    const meshVisual = this.getOrCreateCalibrationPlaneMeshVisual(visual)
    if (!meshVisual) {
      return
    }

    const builder = this.getOrCreateCalibrationPlaneMeshBuilder()
    const vertexCount = builder.getVerticesCount()
    const indexCount = builder.getIndicesCount()
    if (vertexCount > 0) {
      builder.eraseVertices(0, vertexCount)
    }
    if (indexCount > 0) {
      builder.eraseIndices(0, indexCount)
    }

    const right = points.topRight.sub(points.topLeft)
    const down = points.bottomLeft.sub(points.topLeft)
    const normal = right.cross(down).normalize()
    const offset = normal.uniformScale(this.calibrationPlaneDepthBiasMeters)

    const topLeft = points.topLeft.add(offset)
    const topRight = points.topRight.add(offset)
    const bottomLeft = points.bottomLeft.add(offset)
    const bottomRight = points.bottomRight.add(offset)

    builder.appendVerticesInterleaved([
      topLeft.x,
      topLeft.y,
      topLeft.z,
      normal.x,
      normal.y,
      normal.z,
      0,
      0,
      topRight.x,
      topRight.y,
      topRight.z,
      normal.x,
      normal.y,
      normal.z,
      1,
      0,
      bottomLeft.x,
      bottomLeft.y,
      bottomLeft.z,
      normal.x,
      normal.y,
      normal.z,
      0,
      1,
      bottomRight.x,
      bottomRight.y,
      bottomRight.z,
      normal.x,
      normal.y,
      normal.z,
      1,
      1
    ])

    builder.appendIndices([
      0,
      2,
      1,
      1,
      2,
      3,
      1,
      2,
      0,
      3,
      2,
      1
    ])

    builder.updateMesh()
    meshVisual.mesh = builder.getMesh()

    if (this.calibrationPlaneMaterial) {
      meshVisual.mainMaterial = this.calibrationPlaneMaterial
    } else if (!this.loggedMissingPlaneMaterial) {
      this.loggedMissingPlaneMaterial = true
      this.log("plane visual has no material assigned; set calibrationPlaneMaterial for consistent visibility")
    }

    visual.enabled = true
  }

  private setCalibrationPlaneVisible(visible: boolean): void {
    const visual = this.getCalibrationPlaneVisual()
    if (!hasSceneObject(visual)) {
      return
    }
    visual.enabled = visible
  }

  private trySendTwoFingerScrollGesture(
    indexProjected: ReturnType<ScreenProjection["project"]>,
    middleProjected: ReturnType<ScreenProjection["project"]>,
    pinching: boolean
  ): boolean {
    if (!this.enableTwoFingerScroll || pinching || indexProjected === null || middleProjected === null) {
      this.twoFingerScrollActive = false
      return false
    }

    const deltaU = indexProjected.u - middleProjected.u
    const deltaV = indexProjected.v - middleProjected.v
    const separation = Math.sqrt(deltaU * deltaU + deltaV * deltaV)
    const planeDelta = Math.abs(indexProjected.distanceToPlane - middleProjected.distanceToPlane)
    const bothTouchingPlane = indexProjected.touchPlane && middleProjected.touchPlane
    const shouldScroll =
      indexProjected.insideBounds &&
      middleProjected.insideBounds &&
      (!this.enablePlaneTouchMode || !this.twoFingerScrollRequiresPlaneTouch || bothTouchingPlane) &&
      separation >= this.twoFingerMinSeparationUv &&
      separation <= this.twoFingerMaxSeparationUv &&
      planeDelta <= this.twoFingerMaxPlaneDeltaMeters

    if (!shouldScroll) {
      this.twoFingerScrollActive = false
      return false
    }

    const u = (indexProjected.u + middleProjected.u) * 0.5
    const v = (indexProjected.v + middleProjected.v) * 0.5

    if (!this.twoFingerScrollActive) {
      this.interaction.reset()
      this.previousTwoFingerU = u
      this.previousTwoFingerV = v
      this.smoothedTwoFingerDeltaU = 0
      this.smoothedTwoFingerDeltaV = 0
      this.twoFingerScrollActive = true
      this.log("two-finger scroll started")
      return true
    }

    const rawDeltaU = u - this.previousTwoFingerU
    const rawDeltaV = v - this.previousTwoFingerV
    this.previousTwoFingerU = u
    this.previousTwoFingerV = v

    this.smoothedTwoFingerDeltaU = lerp(this.smoothedTwoFingerDeltaU, rawDeltaU, 0.35)
    this.smoothedTwoFingerDeltaV = lerp(this.smoothedTwoFingerDeltaV, rawDeltaV, 0.35)

    if (Math.abs(this.smoothedTwoFingerDeltaU) < this.deadzone && Math.abs(this.smoothedTwoFingerDeltaV) < this.deadzone) {
      return true
    }

    const packet: PointerPacket = {
      type: "pointer",
      u,
      v,
      pinch: false,
      phase: "scroll",
      distanceToPlane: (indexProjected.distanceToPlane + middleProjected.distanceToPlane) * 0.5,
      scrollX: this.smoothedTwoFingerDeltaU * this.twoFingerScrollSensitivity,
      scrollY: -this.smoothedTwoFingerDeltaV * this.twoFingerScrollSensitivity,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging) {
      this.log(
        "two-finger scroll u=" +
          packet.u.toFixed(3) +
          " v=" +
          packet.v.toFixed(3) +
          " sep=" +
          separation.toFixed(3) +
          " sx=" +
          packet.scrollX.toFixed(1) +
          " sy=" +
          packet.scrollY.toFixed(1)
      )
    }

    return true
  }

  private bindEditorSimulator(): void {
    this.createEvent("TouchStartEvent").bind((eventData: TouchStartEvent) => {
      const position = eventData.getTouchPosition()
      this.sendEditorPointer(position, false, "hover")
      this.sendEditorPointer(position, true, "down")
    })

    this.createEvent("TouchMoveEvent").bind((eventData: TouchMoveEvent) => {
      this.sendEditorPointer(eventData.getTouchPosition(), true, "drag")
    })

    this.createEvent("TouchEndEvent").bind((eventData: TouchEndEvent) => {
      this.sendEditorPointer(eventData.getTouchPosition(), false, "up")
    })
  }

  private sendEditorPointer(position: vec2, pinch: boolean, phase: PointerPacket["phase"]): void {
    const packet: PointerPacket = {
      type: "pointer",
      u: Math.max(0, Math.min(1, position.x)),
      v: Math.max(0, Math.min(1, position.y)),
      pinch,
      phase,
      distanceToPlane: 0,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging) {
      this.log("editor " + phase + " u=" + packet.u.toFixed(3) + " v=" + packet.v.toFixed(3))
    }
  }

  private handlePinchDown(): void {
    if (!this.hand.isTracked()) {
      return
    }

    if (this.projection.isCalibrated()) {
      return
    }

    const corner = this.corners[this.cornerIndex]
  const point = cloneVec3(this.hand.indexTip.position)
  this.points[corner] = point
  this.placeCornerHandle(corner, point)
    this.cornerIndex += 1
    this.log("saved " + this.cornerLabels[this.cornerIndex - 1])

    if (this.cornerIndex < this.corners.length) {
      this.log("pinch " + this.cornerLabels[this.cornerIndex])
      return
    }

    const completedPoints = this.points as ScreenCalibrationPoints
    if (this.projection.setCalibration(completedPoints)) {
      this.hasSmoothedUv = false
      this.interaction.reset()
      this.placeCornerHandles(completedPoints)
      this.lastHandleCalibrationPoints = completedPoints
      this.updateCalibrationPlaneVisual(completedPoints)
      this.packetsEnabled = !this.requireConfirmBeforeSending
      this.setConfirmButtonEnabled(this.requireConfirmBeforeSending)
      this.log("calibration complete")
    } else {
      this.log("calibration failed; pinch corners again")
      this.resetCalibration()
    }
  }

  private smooth(u: number, v: number, amount: number, isPressed: boolean): {u: number; v: number} {
    const now = getTime()
    if (!this.hasSmoothedUv) {
      this.previousU = u
      this.previousV = v
      this.previousRawU = u
      this.previousRawV = v
      this.previousSmoothTime = now
      this.hasSmoothedUv = true
      return {u, v}
    }

    const dt = Math.max(0.001, now - this.previousSmoothTime)
    const predictionSeconds = isPressed ? this.predictionSeconds : this.predictionSeconds * 0.35
    const maxPredictionUv = isPressed ? this.maxPredictionUv : this.maxPredictionUv * 0.4
    const effectiveAmount = isPressed ? amount : Math.max(0.2, amount * 0.72)
    const effectiveDeadzone = isPressed ? this.deadzone : this.deadzone * 1.8
    const velocityU = (u - this.previousRawU) / dt
    const velocityV = (v - this.previousRawV) / dt
    const predictedU = clamp01(u + clamp(velocityU * predictionSeconds, -maxPredictionUv, maxPredictionUv))
    const predictedV = clamp01(v + clamp(velocityV * predictionSeconds, -maxPredictionUv, maxPredictionUv))

    this.previousRawU = u
    this.previousRawV = v
    this.previousSmoothTime = now

    const deltaU = Math.abs(predictedU - this.previousU)
    const deltaV = Math.abs(predictedV - this.previousV)
    if (deltaU < effectiveDeadzone && deltaV < effectiveDeadzone) {
      return {u: this.previousU, v: this.previousV}
    }

    this.previousU = lerp(this.previousU, predictedU, effectiveAmount)
    this.previousV = lerp(this.previousV, predictedV, effectiveAmount)
    return {u: this.previousU, v: this.previousV}
  }

  private resetCalibration(): void {
    this.points = {}
    this.cornerIndex = 0
    this.hasSmoothedUv = false
    this.previousSmoothTime = 0
    this.planeTouchActive = false
    this.projection.reset()
    this.interaction.reset()
    this.scrollGestureActive = false
    this.twoFingerScrollActive = false
    this.packetsEnabled = !this.requireConfirmBeforeSending
    this.lastHandleCalibrationPoints = null
    this.setCalibrationPlaneVisible(false)
    this.setCornerHandlesVisible(false)
    this.setConfirmButtonEnabled(false)
    this.log("pinch " + this.cornerLabels[this.cornerIndex])
  }

  private debugProjection(projected: ReturnType<ScreenProjection["project"]>): void {
    if (!this.debugLogging) {
      return
    }

    const now = getTime()
    if (now - this.lastProjectionDebugAt < 0.5) {
      return
    }
    this.lastProjectionDebugAt = now

    if (projected === null) {
      this.log("projection unavailable")
      return
    }

    this.log(
      "projection rawU=" +
        projected.rawU.toFixed(3) +
        " rawV=" +
        projected.rawV.toFixed(3) +
        " d=" +
        projected.distanceToPlane.toFixed(3) +
        " inside=" +
        projected.insideBounds +
        " near=" +
        projected.nearPlane +
        " touch=" +
        projected.touchPlane
    )
  }

  private log(message: string): void {
    if (this.debugLogging) {
      print("[AirTouch] " + message)
    }
  }

  private getConfiguredHandType(): HandType {
    return this.handType === "left" ? "left" : "right"
  }
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function cloneVec3(value: vec3): vec3 {
  return new vec3(value.x, value.y, value.z)
}

function pointsNearlyEqual(a: ScreenCalibrationPoints, b: ScreenCalibrationPoints, toleranceMeters: number): boolean {
  return (
    a.topLeft.distance(b.topLeft) <= toleranceMeters &&
    a.topRight.distance(b.topRight) <= toleranceMeters &&
    a.bottomLeft.distance(b.bottomLeft) <= toleranceMeters &&
    a.bottomRight.distance(b.bottomRight) <= toleranceMeters
  )
}

function hasSceneObject(value: SceneObject): boolean {
  return value !== null && value !== undefined
}

function hasMaterial(value: Material): boolean {
  return value !== null && value !== undefined
}

function findSceneObjectByName(name: string): SceneObject {
  const rootCount = global.scene.getRootObjectsCount()
  for (let i = 0; i < rootCount; i++) {
    const found = findSceneObjectByNameRecursive(global.scene.getRootObject(i), name)
    if (hasSceneObject(found)) {
      return found
    }
  }
  return null
}

function findSceneObjectByNameRecursive(node: SceneObject, name: string): SceneObject {
  if (!hasSceneObject(node)) {
    return null
  }

  if (node.name === name) {
    return node
  }

  const childCount = node.getChildrenCount()
  for (let i = 0; i < childCount; i++) {
    const found = findSceneObjectByNameRecursive(node.getChild(i), name)
    if (hasSceneObject(found)) {
      return found
    }
  }

  return null
}
