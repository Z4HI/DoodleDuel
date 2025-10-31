import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface DrawingToolsPaletteProps {
  // Color controls
  brushColor: string;
  onColorChange: (color: string) => void;
  availableColors?: string[];
  
  // Size controls
  brushSize: number;
  onSizeChange: (size: number) => void;
  availableSizes?: { value: number; label: string }[];
  
  // Tool actions
  isEraseMode: boolean;
  onToggleEraseMode: () => void;
  onUndo: () => void;
  onClear: () => void;
  
  // Disable state (for game over, etc.)
  disabled?: boolean;
}

// Standard colors across all screens
const DEFAULT_COLORS = ['#000000', '#FF0000', '#0000FF', '#00FF00'];

// Standard brush sizes across all screens
const DEFAULT_SIZES = [
  { value: 2, label: 'Small' },
  { value: 3, label: 'Medium' },
  { value: 5, label: 'Large' }
];

export default function DrawingToolsPalette({
  brushColor,
  onColorChange,
  availableColors = DEFAULT_COLORS,
  brushSize,
  onSizeChange,
  availableSizes = DEFAULT_SIZES,
  isEraseMode,
  onToggleEraseMode,
  onUndo,
  onClear,
  disabled = false
}: DrawingToolsPaletteProps) {
  return (
    <View style={styles.container}>
      <View style={styles.controlsContent}>
        {/* Color Controls */}
        <View style={styles.colorControls}>
          <Text style={styles.controlLabel}>Colors</Text>
          <View style={styles.colorRow}>
            {availableColors.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorButton, 
                  { backgroundColor: color }, 
                  brushColor === color && styles.selectedColor,
                  disabled && styles.disabledControl
                ]}
                onPress={() => !disabled && onColorChange(color)}
                disabled={disabled}
              />
            ))}
          </View>
        </View>

        {/* Size Controls */}
        <View style={styles.sizeControls}>
          <Text style={styles.controlLabel}>Size</Text>
          {availableSizes.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[
                styles.sizeButton, 
                brushSize === size.value && styles.selectedSize,
                disabled && styles.disabledControl
              ]}
              onPress={() => !disabled && onSizeChange(size.value)}
              disabled={disabled}
            >
              <Text style={[
                styles.sizeButtonText,
                brushSize === size.value && styles.selectedSizeText
              ]}>
                {size.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tool Controls */}
        <View style={styles.actionControls}>
          <Text style={styles.controlLabel}>Tools</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.actionButton, 
                isEraseMode && styles.selectedAction,
                disabled && styles.disabledControl
              ]}
              onPress={() => !disabled && onToggleEraseMode()}
              disabled={disabled}
            >
              <Text style={[
                styles.actionButtonText,
                isEraseMode && styles.selectedActionText
              ]}>
                {isEraseMode ? '✏️ Draw' : '🧽 Erase'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.actionButton,
                disabled && styles.disabledControl
              ]} 
              onPress={() => !disabled && onUndo()}
              disabled={disabled}
            >
              <Text style={styles.actionButtonText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.actionButton,
                disabled && styles.disabledControl
              ]} 
              onPress={() => !disabled && onClear()}
              disabled={disabled}
            >
              <Text style={styles.actionButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  controlsContent: {
    width: '100%',
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  
  // Color Controls
  colorControls: {
    marginBottom: 15,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedColor: {
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  
  // Size Controls
  sizeControls: {
    marginBottom: 15,
  },
  sizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  selectedSize: {
    backgroundColor: '#007AFF',
  },
  sizeButtonText: {
    fontSize: 12,
    color: '#333',
  },
  selectedSizeText: {
    color: '#FFFFFF',
  },
  
  // Tool Controls
  actionControls: {
    marginBottom: 15,
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  selectedAction: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  selectedActionText: {
    color: '#FFFFFF',
  },
  
  // Disabled State
  disabledControl: {
    opacity: 0.5,
  },
});

