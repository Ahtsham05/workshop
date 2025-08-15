'use client'

import { z } from 'zod'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout/header'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Main } from '@/components/layout/main'
import SalesProvider from './context/users-context'  // Updated for sales
import Select from 'react-select'
import { useEffect, useRef, useState } from 'react'
import { selectBoxStyle } from '@/assets/styling.ts'
import { IconBackspace } from '@tabler/icons-react'
import { addSale, fetchSaleById, getInvoiceNumber, updateSale } from '@/stores/sale.slice'  // Updated for sales
import { useNavigate } from '@tanstack/react-router'
import { useLocation } from '@tanstack/react-router'
import { useReactToPrint } from 'react-to-print'
import { getCustomerSalesAndTransactions } from '@/stores/customer.slice'

// Define the schema for validation
const itemSchema = z.object({
    product: z.string().min(1, { message: 'Product is required' }),
    quantity: z.number().positive({ message: 'Quantity must be greater than 0' }),
    priceAtSale: z.number().positive({ message: 'Price must be greater than 0' }),
    purchasePrice: z.number().positive({ message: 'Purchase price must be greater than 0' }),
    total: z.number().positive({ message: 'Total must be greater than 0' }),
    profit: z.number().positive({ message: 'Profit must be greater than 0' }),  // Added profit calculation
});

export const saleFormSchema = z.object({
    customer: z.string().min(1, { message: 'Customer is required' }),  // Changed from supplier to customer
    items: z.array(itemSchema).min(1, { message: 'At least one item is required' }),
    saleDate: z.date().optional(),  // Changed from purchaseDate to saleDate
    totalAmount: z.number().positive({ message: 'Total amount is required' }),
    totalProfit: z.number().positive({ message: 'Total profit is required' }),  // Added totalProfit
});

export type SaleForm = z.infer<typeof saleFormSchema>;

const defaultValues: z.infer<typeof saleFormSchema> = {
    customer: '',
    saleDate: new Date(),
    items: [
        {
            product: '',
            quantity: 1,
            priceAtSale: 0,
            purchasePrice: 0,
            total: 0,
            profit: 0,  // Added profit field
        },
    ],
    totalAmount: 0,
    totalProfit: 0,  // Added totalProfit
};

// Define the props for the SalesActionDialog

export default function SalesActionDialog() {
    const location = useLocation();
    const urlParams = new URLSearchParams(location.search);
    const id = urlParams.get('id');
    const isEdit = !!id;

    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');
    const [previousBalance, setPreviousBalance] = useState(0);
    const [invoiceNumber, setInvoiceNumber] = useState<string>('');
    const startDate = new Date().toLocaleDateString()
    useEffect(() => {
        const loadData = async () => {
            if (isEdit) {
                await dispatch(fetchSaleById(id)).then((action) => {
                    form.setValue('customer', action.payload.customer.id)
                    form.setValue('saleDate', new Date(action.payload.saleDate))
                    form.setValue('totalAmount', action.payload.totalAmount)
                    form.setValue('totalProfit', action.payload.totalProfit)  // Set total profit

                    // Filter items and set the product field
                    const filteredValues = action.payload.items?.map((item: any) => {
                        return { ...item, product: item?.product?.id };  // Ensure product is set correctly
                    });

                    form.setValue('items', filteredValues); // Set filtered items to the form
                })
            }
            if(selectedCustomer){
                const params = {
                startDate: startDate,
                endDate: startDate,
                customerId: selectedCustomer, // use data from the response
            };

            await dispatch(getCustomerSalesAndTransactions(params)).then((action) => {
                // Process the payload directly in this effect
                const customerDetails = action.payload;

                // Calculate previous balance from previous sales and transactions
                let previousSaleTotal = 0;
                let previousTransactionsTotal = 0;

                customerDetails?.previousSale?.forEach((sale: any) => {
                    previousSaleTotal += sale.totalAmount;
                });

                customerDetails?.previousTransactions?.forEach((transaction: any) => {
                    if (transaction.transactionType === "cashReceived") {
                        previousTransactionsTotal += transaction.amount;
                    } else {
                        previousTransactionsTotal -= transaction.amount;
                    }
                });

                const previousBalance = previousSaleTotal - previousTransactionsTotal;
                setPreviousBalance(previousBalance);
            });
            }

            if(!isEdit){
                await dispatch(getInvoiceNumber({})).then((action)=>{
                    setInvoiceNumber(action.payload?.invoiceNumber || '')
                })
            }
        };
        loadData();
    }, [id, selectedCustomer]);

    const form = useForm<SaleForm>({
        resolver: zodResolver(saleFormSchema),
        defaultValues,
    });
    const productsOptions = useSelector((state: any) => state.product?.products);
    const customersOptions = useSelector((state: any) => state.customer?.data);
    const [totalInvoice, setTotalInvoice] = useState(0)

    // console.log("customersOptions", customersOptions)
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const dispatch = useDispatch<AppDispatch>();
    const componentRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate();

    const onSubmit = async (values: SaleForm) => {
        if (isEdit) {
            await dispatch(updateSale({ ...values, id: id })).then((action) => {
                if (action.payload?.id) {
                    toast.success('Sale updated successfully');
                    navigate({ to: '/sale', replace: true })
                    // form.reset();
                }
            });
        } else {
            await dispatch(addSale(values)).then((action) => {
                if (action.payload.id) {
                    toast.success('Sale created successfully');
                    // form.reset();
                }
            });
        }
    };

    const watchedItems = useWatch({ control: form.control, name: 'items' }) || [];

    useEffect(() => {
        let total = 0;
        let profit = 0;
        for (let i = 0; i < watchedItems.length; i++) {
            total += Number(watchedItems[i].total) || 0; // Avoid NaN in case of invalid total
            profit += Number(watchedItems[i].profit) || 0; // Calculate total profit
        }
        form.setValue('totalAmount', total);
        form.setValue('totalProfit', profit);  // Set total profit
        setTotalInvoice(total)
    }, [watchedItems]);

    const handleAfterPrint = () => {
        form.reset()
    }


    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: 'Sale Invoice',
        pageStyle: 'margin: 0.5cm;',
        onAfterPrint: handleAfterPrint,
    })

    const handleSaveAndPrint = async () => {
        const valid = await form.trigger()
        if (!valid) return
        const values = form.getValues()
        await onSubmit(values)

        if (!componentRef.current) {
            toast.error('Nothing to print!')
            return
        }

        // Slight delay to ensure DOM ready for printing
        setTimeout(() => {
            handlePrint()
        }, 100)
    }

    const handleReset = ()=>{
        form.reset()
    }

    return (

        <>
            <style>{`
        .print-invoice {
          display: none !important;
        }
        @media print {
          form {
            display: none !important;
          }
          .print-invoice {
            display: block !important;
          }
        }
      `}</style>

            <SalesProvider>
                <Header fixed>
                    <Search />
                    <div className="ml-auto flex items-center space-x-4">
                        <ThemeSwitch />
                        <ProfileDropdown />
                    </div>
                </Header>
                <Main>
                    <div className="mb-2 flex flex-wrap items-center justify-between space-y-2">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">{isEdit ? 'Edit Sale' : 'Add New Sale'}</h2>
                            <p className="text-muted-foreground">
                                {isEdit ? 'Update the Sale here.' : 'Create new Sale here.'}
                                Click save when you're done.
                            </p>
                        </div>
                    </div>
                    <div className="-mr-4 overflow-y-auto min-h-[50vh] py-1 pr-4">
                        <Form {...form}>
                            <form
                                id="sale-form"
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4 p-0.5"
                            >
                                <div className="w-full">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 z-10">
                                        <FormField
                                            control={form.control}
                                            name="customer"
                                            render={() => (
                                                <FormItem className="space-y-0">
                                                    <FormLabel className="col-span-2 text-right">Customer Name</FormLabel>
                                                    <FormControl>
                                                        <Controller
                                                            name="customer"
                                                            control={form.control}
                                                            render={({ field }) => (
                                                                <Select
                                                                    {...field}
                                                                    placeholder="Select Customer..."
                                                                    options={customersOptions}
                                                                    value={customersOptions?.find((o: any) => o?.value === field?.value)} // Ensure value is correctly set
                                                                    onChange={(option) => {
                                                                        field.onChange(option?.value); // Ensure we are passing the correct value
                                                                        setSelectedCustomer(option?.value); // Update selected customer state
                                                                        setSelectedCustomerName(option?.label); // Update selected customer name state
                                                                    }}
                                                                    styles={selectBoxStyle}
                                                                    className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                                                                />
                                                            )}
                                                        />
                                                    </FormControl>
                                                    <FormMessage className="col-span-4 col-start-3" />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="saleDate"
                                            render={() => (
                                                <FormItem className="space-y-0">
                                                    <FormLabel className="col-span-2 text-right">Sale Date</FormLabel>
                                                    <FormControl>
                                                        <Controller
                                                            name="saleDate"
                                                            control={form.control}
                                                            render={({ field }) => (
                                                                <input
                                                                    type="date"
                                                                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                                                    onChange={(e) => field.onChange(new Date(e.target.value))}
                                                                    className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white p-2"
                                                                    autoComplete="off"
                                                                />
                                                            )}
                                                        />
                                                    </FormControl>
                                                    <FormMessage className="col-span-4 col-start-3" />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-4">
                                        <h3 className="text-lg font-semibold">Items</h3>
                                        <Button
                                            type="button"
                                            onClick={() => append({ product: '', quantity: 1, priceAtSale: 0, purchasePrice: 0, total: 0, profit: 0 })}
                                        >
                                            Add Item
                                        </Button>
                                    </div>
                                    <div className="my-6 space-y-2">
                                        {fields.map((item, index) => (
                                            <div key={item.id} className="grid grid-cols-1 sm:grid-cols-8 gap-4 items-center">
                                                <Controller
                                                    name={`items.${index}.product`}
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <Select
                                                            {...field}
                                                            options={productsOptions}
                                                            placeholder="Select Product"
                                                            value={productsOptions.find((opt: any) => opt?.value === field?.value)}
                                                            onChange={(option) => {
                                                                // console.log("option", option);
                                                                form.setValue(`items.${index}.priceAtSale`, option?.price);
                                                                form.setValue(`items.${index}.purchasePrice`, option?.cost);
                                                                form.setValue(`items.${index}.total`, option?.price * form.getValues(`items.${index}.quantity`));
                                                                form.setValue(`items.${index}.profit`, (option?.price - option?.cost) * form.getValues(`items.${index}.quantity`)); // Profit calculation
                                                                field.onChange(option?.value)

                                                            }}
                                                            styles={selectBoxStyle}
                                                            className="col-span-4 text-sm outline-none border-1 rounded-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] bg-transparent text-black dark:text-white"
                                                        />
                                                    )}
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Quantity"
                                                    {...form.register(`items.${index}.quantity`, {
                                                        valueAsNumber: true,
                                                        onChange: (e) => {
                                                            const value = e.target.value;
                                                            const quantity = parseFloat(value) || 0;
                                                            form.setValue(`items.${index}.quantity`, quantity);
                                                            const priceAtSale = form.getValues(`items.${index}.priceAtSale`);
                                                            const purchasePrice = form.getValues(`items.${index}.purchasePrice`);
                                                            const total = quantity * priceAtSale;
                                                            form.setValue(`items.${index}.total`, total);
                                                            const profit = (priceAtSale - purchasePrice) * quantity;
                                                            form.setValue(`items.${index}.profit`, profit); // Update profit
                                                        },
                                                    })}
                                                    className="sm:max-w-[200px] col-span-1 p-2 border rounded-md"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Price"
                                                    {...form.register(`items.${index}.priceAtSale`, {
                                                        valueAsNumber: true,
                                                        onChange: (e) => {
                                                            const value = e.target.value;
                                                            const priceAtSale = parseFloat(value) || 0;
                                                            form.setValue(`items.${index}.priceAtSale`, priceAtSale);
                                                            const purchasePrice = form.getValues(`items.${index}.purchasePrice`);
                                                            const quantity = form.getValues(`items.${index}.quantity`);
                                                            const total = priceAtSale * quantity;
                                                            form.setValue(`items.${index}.total`, total);
                                                            const profit = (priceAtSale - purchasePrice) * quantity;
                                                            form.setValue(`items.${index}.profit`, profit); // Update profit
                                                        },
                                                    })}
                                                    className="sm:max-w-[200px] col-span-1 p-2 border rounded-md"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Purchase Price"
                                                    {...form.register(`items.${index}.purchasePrice`, {
                                                        valueAsNumber: true,
                                                    })}
                                                    disabled
                                                    hidden
                                                    className="sm:max-w-[200px] col-span-1 p-2 border rounded-md"
                                                />
                                                <input
                                                    type="number"
                                                    disabled
                                                    value={form.getValues(`items.${index}.total`) || 0}
                                                    className="sm:max-w-[200px] col-span-1 p-2 border rounded-md text-gray-600"
                                                />
                                                <input
                                                    type="number"
                                                    disabled
                                                    hidden
                                                    value={form.getValues(`items.${index}.profit`) || 0}
                                                    className="sm:max-w-[200px] col-span-1 p-2 border rounded-md text-gray-600"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    className="w-fit"
                                                    onClick={() => remove(index)}
                                                >
                                                    <IconBackspace stroke={2} className="size-6" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className='grid grid-cols-1 sm:grid-cols-3 my-5 gap-4'>
                                        <div className="mt-4">
                                            <label className="font-medium text-sm">Total Amount</label>
                                            <input
                                                type="number"
                                                disabled
                                                value={totalInvoice}
                                                className="w-full mt-1 p-2 border rounded-md text-gray-700"
                                            />
                                        </div>
                                        {/* <div className="mt-4">
                                    <label className="font-medium text-sm">Total Profit</label>
                                    <input
                                        type="number"
                                        disabled
                                        value={"o"}
                                        className="w-full mt-1 p-2 border rounded-md text-gray-700"
                                    />
                                </div> */}
                                    </div>
                                </div>
                            </form>
                        </Form>
                        <div
                            ref={componentRef}
                            className="print-invoice"
                            style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '1rem' }}
                        >
                            <div className="bg-white border rounded-lg shadow-lg px-6 py-8 max-w-md mx-auto mt-8">
                                <h1 className="font-bold text-2xl my-4 text-center text-blue-600">SHAHID MOBILES</h1>
                                <hr className="mb-2" />
                                <div className="flex justify-between mb-6">
                                    <h1 className="text-lg font-bold">Invoice</h1>
                                    <div className="text-gray-700">
                                        <div>
                                            Date: {form.getValues('saleDate')
                                                ? new Date(form.getValues('saleDate') as Date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                                                : 'N/A'}                                      
                                        </div>
                                        <div>
                                            Invoice# : {invoiceNumber || 'N/A'}                                      
                                        </div>
                                    </div>
                                </div>
                                <div className="mb-8">
                                    <h2 className="text-lg font-bold mb-4">Bill To:</h2>
                                    <div className="text-gray-700 mb-2">{selectedCustomerName}</div>
                                </div>
                                <table className="w-full mb-8">
                                    <thead>
                                        <tr className="border-b border-t border-gray-200">
                                            <th className="text-left font-bold text-gray-700">Description</th>
                                            <th className="text-right font-bold text-gray-700">Qty</th>
                                            <th className="text-right font-bold text-gray-700">Price</th>
                                            <th className="text-right font-bold text-gray-700">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {
                                            form.getValues('items').map((item, index) => {
                                                const product = productsOptions?.find((p: any) => p.id === item.product);
                                                return (
                                                    <tr key={index} className="border-b border-gray-200">
                                                        <td className="text-left text-gray-700">{product ? product.name : 'Unknown Product'}</td>
                                                        <td className="text-right text-gray-700">{item.quantity}</td>
                                                        <td className="text-right text-gray-700">Rs.{item.priceAtSale.toFixed(2)}</td>
                                                        <td className="text-right text-gray-700">Rs.{item.total.toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })
                                        }
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td className="text-left font-bold text-gray-700" colSpan={3}>Total</td>
                                            <td className="text-right font-bold text-gray-700">Rs.{form.getValues('totalAmount')}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-left font-bold text-gray-700" colSpan={3}>Prev Bal.</td>
                                            <td className="text-right font-bold text-gray-700">Rs.{previousBalance}</td>
                                        </tr>
                                        <tr>
                                            <td className="text-left font-bold text-gray-700" colSpan={3}>Net Totall.</td>
                                            <td className="text-right font-bold text-gray-700">Rs.{previousBalance + form.getValues('totalAmount')}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <p className='text-center text-gray-700 my-2 mb-4'>Thank you for your purchase!</p>
                                <div className="border-t-2 border-gray-300 pt-2 mb-2">
                                    {/* <div className="text-gray-700 mb-2 text-center">Nalka Kohala stop Sargodha road, Faisalabad.</div> */}
                                    <div className="text-gray-700 mb-2 text-center">Nalka Kohala stop Sargodha road, Faisalabad.</div>
                                    <div className="text-gray-700 text-center">03457005071,03217005071</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className='flex gap-4'>
                        <Button onClick={handleReset} type="button">
                            Reset Sale
                        </Button>
                        <Button type="submit" form="sale-form">
                            Save changes
                        </Button>
                        <Button onClick={handleSaveAndPrint} type="button">
                            Save & Print
                        </Button>
                    </div>
                </Main>
            </SalesProvider>
        </>
    );
}
