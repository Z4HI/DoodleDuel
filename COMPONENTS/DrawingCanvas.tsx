import React from 'react';
import { Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Standard canvas dimensions
const CANVAS_WIDTH = screenWidth - 40;
const CANVAS_HEIGHT = screenHeight * 0.5;

interface PathData {
  path: string;
  color: string;
  strokeWidth: number;
}

interface DrawingCanvasProps {
  // Path data
  paths: PathData[];
  currentPath?: string;
  
  // Drawing state
  brushColor: string;
  brushSize: number;
  isEraseMode?: boolean;
  
  // Interaction handlers
  onDrawingStart?: (point: { x: number; y: number }) => void;
  onDrawingMove?: (point: { x: number; y: number }) => void;
  onDrawingEnd?: () => void;
  
  // Disabled state
  disabled?: boolean;
  
  // Canvas ref (optional, for capturing)
  canvasRef?: React.RefObject<View>;
  
  // Custom dimensions (optional)
  width?: number;
  height?: number;
}

export default function DrawingCanvas({
  paths,
  currentPath,
  brushColor,
  brushSize,
  isEraseMode = false,
  onDrawingStart,
  onDrawingMove,
  onDrawingEnd,
  disabled = false,
  canvasRef,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
}: DrawingCanvasProps) {
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    
    onPanResponderGrant: (evt) => {
      if (disabled) return;
      const { locationX, locationY } = evt.nativeEvent;
      onDrawingStart?.({ x: locationX, y: locationY });
    },
    
    onPanResponderMove: (evt) => {
      if (disabled) return;
      const { locationX, locationY } = evt.nativeEvent;
      onDrawingMove?.({ x: locationX, y: locationY });
    },
    
    onPanResponderRelease: () => {
      if (disabled) return;
      onDrawingEnd?.();
    },
  });

  return (
    <View 
      ref={canvasRef}
      style={[styles.canvas, { width, height }]} 
      {...panResponder.panHandlers}
    >
      <Svg style={StyleSheet.absoluteFillObject}>
        {/* Render completed paths */}
        {paths.map((pathData, index) => (
          <Path
            key={index}
            d={pathData.path}
            stroke={pathData.color}
            strokeWidth={pathData.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        
        {/* Render current drawing path */}
        {currentPath && (
          <Path
            d={currentPath}
            stroke={isEraseMode ? '#FFFFFF' : brushColor}
            strokeWidth={isEraseMode ? brushSize * 2 : brushSize}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
});

// Export standard dimensions for use in other components
export { CANVAS_HEIGHT, CANVAS_WIDTH };

