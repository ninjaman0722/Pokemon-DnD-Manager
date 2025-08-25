// src/components/manager/setup/Stepper.jsx
import React from 'react';

const Stepper = ({ currentStep, setStep }) => {
    const steps = ['Settings', 'Player Team', 'Opponent Team', 'Review & Launch'];

    // You can't go to a future step you haven't reached yet
    const isStepDisabled = (stepIndex) => stepIndex + 1 > currentStep;

    return (
        <div className="flex justify-center items-center border-b-2 border-gray-700 mb-8 pb-4">
            {steps.map((step, index) => (
                <React.Fragment key={step}>
                    <button
                        onClick={() => !isStepDisabled(index) && setStep(index + 1)}
                        disabled={isStepDisabled(index)}
                        className="flex items-center gap-2 disabled:cursor-not-allowed"
                    >
                        <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                                currentStep === index + 1 ? 'bg-indigo-600 text-white' : 'bg-gray-600 text-gray-300'
                            } ${!isStepDisabled(index) ? 'hover:bg-indigo-500' : 'opacity-50'}`}
                        >
                            {index + 1}
                        </div>
                        <span className={`font-semibold hidden sm:inline ${currentStep === index + 1 ? 'text-white' : 'text-gray-400'}`}>
                            {step}
                        </span>
                    </button>
                    {index < steps.length - 1 && (
                        <div className="flex-auto border-t-2 border-gray-600 mx-4"></div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};

export default Stepper;